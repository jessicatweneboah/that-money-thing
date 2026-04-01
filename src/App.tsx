import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Home, Key, TrendingUp, DollarSign, Info, Percent, ArrowRightLeft,
  Wallet, ShieldCheck, Building, Scale, MapPin, Tag, Users, Clock,
  ChevronDown, ChevronUp, Calendar,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PropertyType = 'sfh' | 'condo';

interface StatePreset {
  name: string;
  propTaxRate: number;
  appreciationSfh: number;
  appreciationCondo: number;
  rentIncrease: number;
  hasProp13: boolean;
  buyingClosingCostsPct: number;
  sellingCostsPct: number;
  medianPrice: number;
  medianRent: number;
  stateTaxRate: number;
  hasMelloRoos: boolean;
}

// ---------------------------------------------------------------------------
// State presets
// ---------------------------------------------------------------------------

const STATE_PRESETS: Record<string, StatePreset> = {
  CA: {
    name: 'California',
    propTaxRate: 1.25,
    appreciationSfh: 3.0,
    appreciationCondo: 1.5,
    rentIncrease: 4,
    hasProp13: true,
    buyingClosingCostsPct: 2.5,
    sellingCostsPct: 6.0,
    medianPrice: 850_000,
    medianRent: 3_800,
    stateTaxRate: 9.3,
    hasMelloRoos: true,
  },
  TX: {
    name: 'Texas',
    propTaxRate: 2.1,
    appreciationSfh: 2.0,
    appreciationCondo: 0.5,
    rentIncrease: 3,
    hasProp13: false,
    buyingClosingCostsPct: 3.0,
    sellingCostsPct: 6.0,
    medianPrice: 350_000,
    medianRent: 2_100,
    stateTaxRate: 0,
    hasMelloRoos: false,
  },
  NY: {
    name: 'New York',
    propTaxRate: 1.7,
    appreciationSfh: 2.2,
    appreciationCondo: 1.0,
    rentIncrease: 4,
    hasProp13: false,
    buyingClosingCostsPct: 4.0,
    sellingCostsPct: 6.0,
    medianPrice: 700_000,
    medianRent: 3_500,
    stateTaxRate: 6.85,
    hasMelloRoos: false,
  },
  IL: {
    name: 'Chicago (IL)',
    propTaxRate: 2.1,
    appreciationSfh: 1.5,
    appreciationCondo: 0.5,
    rentIncrease: 3.5,
    hasProp13: false,
    buyingClosingCostsPct: 3.0,
    sellingCostsPct: 6.0,
    medianPrice: 350_000,
    medianRent: 2_200,
    stateTaxRate: 4.95,
    hasMelloRoos: false,
  },
  WA: {
    name: 'Washington',
    propTaxRate: 1.0,
    appreciationSfh: 2.5,
    appreciationCondo: 1.0,
    rentIncrease: 4,
    hasProp13: false,
    buyingClosingCostsPct: 2.5,
    sellingCostsPct: 6.0,
    medianPrice: 600_000,
    medianRent: 2_800,
    stateTaxRate: 0,
    hasMelloRoos: false,
  },
  GEN: {
    name: 'Standard / Other',
    propTaxRate: 1.1,
    appreciationSfh: 1.5,
    appreciationCondo: 0.0,
    rentIncrease: 3,
    hasProp13: false,
    buyingClosingCostsPct: 3.0,
    sellingCostsPct: 6.0,
    medianPrice: 400_000,
    medianRent: 2_200,
    stateTaxRate: 5.0,
    hasMelloRoos: false,
  },
};

// ---------------------------------------------------------------------------
// Federal tax brackets (2026 projected, simplified)
// ---------------------------------------------------------------------------

const FEDERAL_BRACKETS_SINGLE = [
  { limit: 11_925, rate: 10 },
  { limit: 48_475, rate: 12 },
  { limit: 103_350, rate: 22 },
  { limit: 197_300, rate: 24 },
  { limit: 250_525, rate: 32 },
  { limit: 626_350, rate: 35 },
  { limit: Infinity, rate: 37 },
];

const FEDERAL_BRACKETS_MARRIED = [
  { limit: 23_850, rate: 10 },
  { limit: 96_950, rate: 12 },
  { limit: 206_700, rate: 22 },
  { limit: 394_600, rate: 24 },
  { limit: 501_050, rate: 32 },
  { limit: 751_600, rate: 35 },
  { limit: Infinity, rate: 37 },
];

function deriveMarginalRate(
  income: number,
  filingStatus: 'single' | 'married',
  stateTaxRate: number,
): number {
  const brackets =
    filingStatus === 'married' ? FEDERAL_BRACKETS_MARRIED : FEDERAL_BRACKETS_SINGLE;
  let federalRate = 10;
  for (const b of brackets) {
    if (income <= b.limit) {
      federalRate = b.rate;
      break;
    }
  }
  return federalRate + stateTaxRate;
}

function getStandardDeduction(filingStatus: 'single' | 'married'): number {
  return filingStatus === 'married' ? 31_400 : 15_700;
}

const fmt = (n: number) => Math.round(n).toLocaleString();
const fmtK = (n: number) => `$${(n / 1_000).toFixed(0)}k`;

const STORAGE_KEY = 'rent-vs-buy-inputs';

function loadSaved<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (key in parsed) return parsed[key] as T;
    }
  } catch { /* ignore */ }
  return fallback;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const App = () => {
  const [selectedState, setSelectedState] = useState('CA');

  // Personal tax profile
  const [householdIncome, setHouseholdIncome] = useState(() => loadSaved('householdIncome', 270_000));
  const [filingStatus, setFilingStatus] = useState<'single' | 'married'>(() => loadSaved('filingStatus', 'single'));
  const [otherDeductions, setOtherDeductions] = useState(() => loadSaved('otherDeductions', 25_000));
  const [saltCap, setSaltCap] = useState(() => loadSaved('saltCap', 10_000));
  const [salaryIncrease, setSalaryIncrease] = useState(() => loadSaved('salaryIncrease', 3));

  // View mode
  type ViewMode = 'primary' | 'rental';
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadSaved('viewMode', 'primary'));

  // Buy inputs
  const [propertyType, setPropertyType] = useState<PropertyType>(() => loadSaved('propertyType', 'condo'));
  const [homePrice, setHomePrice] = useState(() => loadSaved('homePrice', 600_000));
  const [downPaymentPct, setDownPaymentPct] = useState(() => loadSaved('downPaymentPct', 20));
  const [interestRate, setInterestRate] = useState(() => loadSaved('interestRate', 6.5));
  const [loanTerm, setLoanTerm] = useState(() => loadSaved('loanTerm', 20));
  const [propertyTaxRate, setPropertyTaxRate] = useState(() => loadSaved('propertyTaxRate', STATE_PRESETS.CA.propTaxRate));
  const [homeInsurance, setHomeInsurance] = useState(() => loadSaved('homeInsurance', 2_200));
  const [homeInsuranceIncrease, setHomeInsuranceIncrease] = useState(() => loadSaved('homeInsuranceIncrease', 3));
  const [monthlyHOA, setMonthlyHOA] = useState(() => loadSaved('monthlyHOA', 400));
  const [hoaIncrease, setHoaIncrease] = useState(() => loadSaved('hoaIncrease', 3));
  const [monthlyMelloRoos, setMonthlyMelloRoos] = useState(() => loadSaved('monthlyMelloRoos', 0));
  const [maintenanceRate, setMaintenanceRate] = useState(() => loadSaved('maintenanceRate', 1.0));
  const [appreciationRate, setAppreciationRate] = useState(() => loadSaved('appreciationRate', 1.5));
  const [buyingClosingCostsPct, setBuyingClosingCostsPct] = useState(() => loadSaved('buyingClosingCostsPct', STATE_PRESETS.CA.buyingClosingCostsPct));
  const [sellingCostsPct, setSellingCostsPct] = useState(() => loadSaved('sellingCostsPct', STATE_PRESETS.CA.sellingCostsPct));

  // Rent inputs
  const [monthlyRent, setMonthlyRent] = useState(() => loadSaved('monthlyRent', 3_100));
  const [rentIncrease, setRentIncrease] = useState(() => loadSaved('rentIncrease', STATE_PRESETS.CA.rentIncrease));
  const [monthlyParking, setMonthlyParking] = useState(() => loadSaved('monthlyParking', 200));
  const [renterInsurance, setRenterInsurance] = useState(() => loadSaved('renterInsurance', 200));
  const [renterInsuranceIncrease, setRenterInsuranceIncrease] = useState(() => loadSaved('renterInsuranceIncrease', 3));
  const [movingCost, setMovingCost] = useState(() => loadSaved('movingCost', 3_000));
  const [moveFrequency, setMoveFrequency] = useState(() => loadSaved('moveFrequency', 2));
  const [investmentReturn, setInvestmentReturn] = useState(() => loadSaved('investmentReturn', 7));

  // Rental property inputs
  const [rentalIncome, setRentalIncome] = useState(() => loadSaved('rentalIncome', 3_500));
  const [rentalIncomeIncrease, setRentalIncomeIncrease] = useState(() => loadSaved('rentalIncomeIncrease', 3));
  const [vacancyRate, setVacancyRate] = useState(() => loadSaved('vacancyRate', 5));
  const [propertyMgmtFee, setPropertyMgmtFee] = useState(() => loadSaved('propertyMgmtFee', 8));
  const [convertYear, setConvertYear] = useState(() => loadSaved('convertYear', 2));
  const [newRent, setNewRent] = useState(() => loadSaved('newRent', 3_100));
  const [newRentIncrease, setNewRentIncrease] = useState(() => loadSaved('newRentIncrease', 4));

  // Analysis
  const [yearsToAnalyze, setYearsToAnalyze] = useState(() => loadSaved('yearsToAnalyze', 15));

  // UI state
  const [showTaxExplainer, setShowTaxExplainer] = useState(false);
  const [soldYear, setSoldYear] = useState(5);
  const [breakdownYear, setBreakdownYear] = useState(1);

  // Persist all inputs to localStorage
  const saveAll = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        householdIncome, filingStatus, otherDeductions, saltCap, salaryIncrease,
        viewMode, propertyType, homePrice, downPaymentPct, interestRate, loanTerm,
        propertyTaxRate, homeInsurance, homeInsuranceIncrease, monthlyHOA, hoaIncrease,
        monthlyMelloRoos, maintenanceRate, appreciationRate, buyingClosingCostsPct, sellingCostsPct,
        monthlyRent, rentIncrease, monthlyParking, renterInsurance, renterInsuranceIncrease,
        movingCost, moveFrequency, investmentReturn,
        rentalIncome, rentalIncomeIncrease, vacancyRate, propertyMgmtFee, convertYear, newRent, newRentIncrease,
        yearsToAnalyze,
      }));
    } catch { /* ignore quota errors */ }
  }, [
    householdIncome, filingStatus, otherDeductions, saltCap, salaryIncrease,
    viewMode, propertyType, homePrice, downPaymentPct, interestRate, loanTerm,
    propertyTaxRate, homeInsurance, homeInsuranceIncrease, monthlyHOA, hoaIncrease,
    monthlyMelloRoos, maintenanceRate, appreciationRate, buyingClosingCostsPct, sellingCostsPct,
    monthlyRent, rentIncrease, monthlyParking, renterInsurance, renterInsuranceIncrease,
    movingCost, moveFrequency, investmentReturn,
    rentalIncome, rentalIncomeIncrease, vacancyRate, propertyMgmtFee, convertYear, newRent, newRentIncrease,
    yearsToAnalyze,
  ]);
  useEffect(() => { saveAll(); }, [saveAll]);

  // Derived marginal rate from income + state
  const preset = STATE_PRESETS[selectedState];
  const marginalTaxRate = deriveMarginalRate(householdIncome, filingStatus, preset.stateTaxRate);

  const handleStateChange = (stateKey: string) => {
    const p = STATE_PRESETS[stateKey];
    setSelectedState(stateKey);
    setHomePrice(p.medianPrice);
    setMonthlyRent(p.medianRent);
    setPropertyTaxRate(p.propTaxRate);
    setAppreciationRate(propertyType === 'sfh' ? p.appreciationSfh : p.appreciationCondo);
    setRentIncrease(p.rentIncrease);
    setBuyingClosingCostsPct(p.buyingClosingCostsPct);
    setSellingCostsPct(p.sellingCostsPct);
    if (!p.hasMelloRoos) setMonthlyMelloRoos(0);
  };

  const handlePropertyTypeChange = (type: PropertyType) => {
    setPropertyType(type);
    setAppreciationRate(type === 'sfh' ? preset.appreciationSfh : preset.appreciationCondo);
    setHomePrice(type === 'sfh' ? 1_500_000 : 600_000);
    // SFH insurance is significantly higher (full structure), condo insurance covers interior only
    setHomeInsurance(type === 'sfh' ? 5_800 : 2_200);
    setMonthlyHOA(type === 'sfh' ? 0 : 400);
  };

  // Tax savings (uses consistent amortised interest from caller)
  const calculateYearlyTaxSavings = (interestPaid: number, propertyTaxPaid: number, overrideRate?: number) => {
    const stdDed = getStandardDeduction(filingStatus);
    const deductiblePropTax = Math.min(propertyTaxPaid, saltCap);
    const totalPotentialItemized = interestPaid + deductiblePropTax + otherDeductions;
    const rate = overrideRate ?? marginalTaxRate;
    if (totalPotentialItemized <= stdDed) return { savings: 0, itemizing: false };
    return {
      savings: (totalPotentialItemized - stdDed) * (rate / 100),
      itemizing: true,
    };
  };

  // Amortisation-based year-1 interest (Gap #20: consistent with chart loop)
  const computeYear1Interest = (loanAmount: number) => {
    const monthlyRate = (interestRate / 100) / 12;
    const numPayments = loanTerm * 12;
    const monthlyPI =
      loanAmount *
      (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
      (Math.pow(1 + monthlyRate, numPayments) - 1);
    let balance = loanAmount;
    let totalInterest = 0;
    for (let m = 0; m < 12; m++) {
      const intM = balance * monthlyRate;
      totalInterest += intM;
      balance -= (monthlyPI - intM);
    }
    if (loanAmount > 750_000) {
      totalInterest *= 750_000 / loanAmount;
    }
    return totalInterest;
  };

  // Year 1 breakdown
  const initialCalculations = useMemo(() => {
    const downPaymentAmount = homePrice * (downPaymentPct / 100);
    const loanAmount = homePrice - downPaymentAmount;
    const monthlyRate = (interestRate / 100) / 12;
    const numPayments = loanTerm * 12;
    const monthlyPI =
      loanAmount *
      (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
      (Math.pow(1 + monthlyRate, numPayments) - 1);

    const yearlyPI = monthlyPI * 12;
    const yearlyTax = homePrice * (propertyTaxRate / 100);
    const yearlyMaint = homePrice * (maintenanceRate / 100);
    const yearlyHOA = monthlyHOA * 12;
    const yearlyMelloRoos = monthlyMelloRoos * 12;
    const yearlyHomeInsurance = homeInsurance;
    const yearlyClosingCosts = homePrice * (buyingClosingCostsPct / 100);

    const firstYearInterest = computeYear1Interest(loanAmount);
    const deductiblePropTax = Math.min(yearlyTax, saltCap);
    const totalItemized = firstYearInterest + deductiblePropTax + otherDeductions;
    const stdDed = getStandardDeduction(filingStatus);
    const { savings: yearlyTaxBenefit, itemizing } = calculateYearlyTaxSavings(
      firstYearInterest,
      yearlyTax,
    );

    const yearlyBuyGross = yearlyPI + yearlyTax + yearlyMaint + yearlyHomeInsurance + yearlyHOA + yearlyMelloRoos;
    const yearlyBuyNet = yearlyBuyGross - yearlyTaxBenefit;

    const yearlyRentBase = monthlyRent * 12;
    const yearlyParking = monthlyParking * 12;
    const yearlyMovingCost = moveFrequency > 0 ? movingCost / moveFrequency : 0;
    const yearlyRentTotal = yearlyRentBase + yearlyParking + renterInsurance + yearlyMovingCost;

    const yearlyDiff = yearlyBuyNet - yearlyRentTotal;

    const monthlyBuyNet = yearlyBuyNet / 12;
    const monthlyRentTotal = yearlyRentTotal / 12;
    const monthlyDiff = monthlyBuyNet - monthlyRentTotal;

    return {
      loanAmount,
      downPaymentAmount,
      monthlyPI,
      yearlyPI,
      yearlyTax,
      yearlyMaint,
      yearlyHOA,
      yearlyMelloRoos,
      yearlyHomeInsurance,
      yearlyClosingCosts,
      yearlyBuyGross,
      yearlyBuyNet,
      yearlyRentTotal,
      yearlyRentBase,
      yearlyParking,
      yearlyMovingCost,
      yearlyRentInsurance: renterInsurance,
      yearlyDiff,
      yearlyTaxBenefit,
      itemizing,
      monthlyBuyNet,
      monthlyRentTotal,
      monthlyDiff,
      // Tax math details
      firstYearInterest,
      deductiblePropTax,
      totalItemized,
      stdDed,
      excessItemized: Math.max(totalItemized - stdDed, 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    homePrice, downPaymentPct, interestRate, loanTerm, propertyTaxRate,
    maintenanceRate, homeInsurance, monthlyHOA, monthlyMelloRoos, monthlyRent, monthlyParking,
    marginalTaxRate, filingStatus, otherDeductions, saltCap, renterInsurance, movingCost, moveFrequency,
    buyingClosingCostsPct,
  ]);

  // Multi-year projection
  const data = useMemo(() => {
    interface YearData {
      year: number;
      'Rent Net Wealth': number;
      'Buy Net Wealth': number;
      'Break Even': number;
      'Net If Sold': number;
      _capitalGain: number;
      _cgExclusion: number;
      _taxableGain: number;
      _capitalGainsTax: number;
      _ltcgRate: number;
      _homeValue: number;
      _loanBalance: number;
      _sellingFees: number;
      // Per-year cash flow breakdown
      _yearlyPI: number;
      _yearlyTax: number;
      _yearlyMaint: number;
      _yearlyHomeInsurance: number;
      _yearlyHOA: number;
      _yearlyMelloRoos: number;
      _yearlyBuyGross: number;
      _yearlyTaxBenefit: number;
      _yearlyBuyNet: number;
      _yearlyRent: number;
      _yearlyParking: number;
      _yearlyRenterInsurance: number;
      _yearlyMovingCost: number;
      _yearlyRentTotal: number;
      _yearlyDiff: number;
      _itemizing: boolean;
      // Tax math
      _firstYearInterest: number;
      _deductiblePropTax: number;
      _totalItemized: number;
      _stdDed: number;
      _excessItemized: number;
      _marginalRate: number;
      _income: number;
    }
    const chartData: YearData[] = [];
    const downPaymentAmount = homePrice * (downPaymentPct / 100);
    const loanAmount = homePrice - downPaymentAmount;
    const initialClosingCosts = homePrice * (buyingClosingCostsPct / 100);
    const initialOutlay = downPaymentAmount + initialClosingCosts;
    const monthlyRate = (interestRate / 100) / 12;
    const numPayments = loanTerm * 12;
    const monthlyPI =
      loanAmount *
      (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
      (Math.pow(1 + monthlyRate, numPayments) - 1);

    let currentHomeValue = homePrice;
    let assessedValue = homePrice;
    let currentLoanBalance = loanAmount;
    let currentRent = monthlyRent;
    let currentMonthlyHOA = monthlyHOA;
    let currentHomeInsurance = homeInsurance;
    let currentMonthlyParking = monthlyParking;
    let currentRenterInsurance = renterInsurance;
    let currentMelloRoos = monthlyMelloRoos;
    let currentIncome = householdIncome;
    let rentWealth = initialOutlay;
    let extraBuySavings = 0;
    const monthlyInvestRate = (investmentReturn / 100) / 12;

    for (let year = 1; year <= yearsToAnalyze; year++) {
      const yearlyTax = assessedValue * (propertyTaxRate / 100);
      const yearlyMaint = currentHomeValue * (maintenanceRate / 100);
      const monthlyHomeFees =
        (yearlyTax + yearlyMaint + currentHomeInsurance) / 12 +
        currentMonthlyHOA +
        currentMelloRoos;

      // Amortised interest for this year (full, not tax-capped)
      let yearlyInterestForTax = 0;
      let tempBalance = currentLoanBalance;
      for (let m = 0; m < 12; m++) {
        const intM = tempBalance * monthlyRate;
        yearlyInterestForTax += tempBalance > 750_000 ? intM * (750_000 / tempBalance) : intM;
        tempBalance -= (monthlyPI - intM);
      }

      const yrMarginalRate = deriveMarginalRate(currentIncome, filingStatus, preset.stateTaxRate);
      const { savings: yearlyTaxBenefit, itemizing: yrItemizing } = calculateYearlyTaxSavings(
        yearlyInterestForTax,
        yearlyTax,
        yrMarginalRate,
      );
      const monthlyTaxBenefit = yearlyTaxBenefit / 12;

      // Capture per-year breakdown before escalation
      const yrPI = monthlyPI * 12;
      const yrHOA = currentMonthlyHOA * 12;
      const yrMelloRoos = currentMelloRoos * 12;
      const yrBuyGross = yrPI + yearlyTax + yearlyMaint + currentHomeInsurance + yrHOA + yrMelloRoos;
      const yrBuyNet = yrBuyGross - yearlyTaxBenefit;
      const yrRent = currentRent * 12;
      const yrParking = currentMonthlyParking * 12;
      const yrRenterIns = currentRenterInsurance;
      const yrMoving = (moveFrequency > 0 && year % moveFrequency === 0) ? movingCost : 0;
      const yrRentTotal = yrRent + yrParking + yrRenterIns + (moveFrequency > 0 ? movingCost / moveFrequency : 0);
      const yrDeductiblePropTax = Math.min(yearlyTax, saltCap);
      const yrTotalItemized = yearlyInterestForTax + yrDeductiblePropTax + otherDeductions;
      const yrStdDed = getStandardDeduction(filingStatus);

      // Moving costs hit in the years you move
      if (yrMoving > 0) {
        rentWealth -= movingCost;
      }

      for (let m = 0; m < 12; m++) {
        const totalMonthlyRentCost = currentRent + currentMonthlyParking + currentRenterInsurance / 12;

        rentWealth *= 1 + monthlyInvestRate;

        const interestM = currentLoanBalance * monthlyRate;
        const netMonthlyBuyCost = monthlyPI + monthlyHomeFees - monthlyTaxBenefit;
        const principalM = monthlyPI - interestM;
        currentLoanBalance -= principalM;

        if (netMonthlyBuyCost > totalMonthlyRentCost) {
          rentWealth += netMonthlyBuyCost - totalMonthlyRentCost;
        } else {
          extraBuySavings *= 1 + monthlyInvestRate;
          extraBuySavings += totalMonthlyRentCost - netMonthlyBuyCost;
        }
      }

      // Annual escalations
      currentHomeValue *= 1 + appreciationRate / 100;
      assessedValue = preset.hasProp13 ? assessedValue * 1.02 : currentHomeValue;
      currentRent *= 1 + rentIncrease / 100;
      currentMonthlyParking *= 1 + rentIncrease / 100;
      currentMonthlyHOA *= 1 + hoaIncrease / 100;
      currentHomeInsurance *= 1 + homeInsuranceIncrease / 100;
      currentRenterInsurance *= 1 + renterInsuranceIncrease / 100;
      currentMelloRoos *= 1.02;
      currentIncome *= 1 + salaryIncrease / 100;

      const estimatedSellingFees = currentHomeValue * (sellingCostsPct / 100);
      const homeEquity =
        currentHomeValue - Math.max(currentLoanBalance, 0) - estimatedSellingFees - initialClosingCosts;
      const totalBuyWealth = homeEquity + extraBuySavings;

      // Net if sold = proceeds after loan payoff, selling fees, and capital gains tax
      const grossProceeds = currentHomeValue - Math.max(currentLoanBalance, 0) - estimatedSellingFees;
      const capitalGain = currentHomeValue - homePrice;
      const cgExclusion = filingStatus === 'married' ? 500_000 : 250_000;
      const taxableGain = Math.max(capitalGain - cgExclusion, 0);
      const ltcgRate = currentIncome > 500_000 ? 20 : 15;
      const capitalGainsTax = taxableGain * (ltcgRate / 100);
      const netIfSold = grossProceeds - capitalGainsTax;

      chartData.push({
        year,
        'Rent Net Wealth': Math.round(rentWealth),
        'Buy Net Wealth': Math.round(totalBuyWealth),
        'Break Even': Math.round(totalBuyWealth - rentWealth),
        'Net If Sold': Math.round(netIfSold),
        _capitalGain: Math.round(capitalGain),
        _cgExclusion: cgExclusion,
        _taxableGain: Math.round(taxableGain),
        _capitalGainsTax: Math.round(capitalGainsTax),
        _ltcgRate: ltcgRate,
        _homeValue: Math.round(currentHomeValue),
        _loanBalance: Math.round(Math.max(currentLoanBalance, 0)),
        _sellingFees: Math.round(estimatedSellingFees),
        // Per-year cash flow
        _yearlyPI: Math.round(yrPI),
        _yearlyTax: Math.round(yearlyTax),
        _yearlyMaint: Math.round(yearlyMaint),
        _yearlyHomeInsurance: Math.round(currentHomeInsurance),
        _yearlyHOA: Math.round(yrHOA),
        _yearlyMelloRoos: Math.round(yrMelloRoos),
        _yearlyBuyGross: Math.round(yrBuyGross),
        _yearlyTaxBenefit: Math.round(yearlyTaxBenefit),
        _yearlyBuyNet: Math.round(yrBuyNet),
        _yearlyRent: Math.round(yrRent),
        _yearlyParking: Math.round(yrParking),
        _yearlyRenterInsurance: Math.round(yrRenterIns),
        _yearlyMovingCost: Math.round(yrMoving > 0 ? movingCost / moveFrequency : 0),
        _yearlyRentTotal: Math.round(yrRentTotal),
        _yearlyDiff: Math.round(yrBuyNet - yrRentTotal),
        _itemizing: yrItemizing,
        _firstYearInterest: Math.round(yearlyInterestForTax),
        _deductiblePropTax: Math.round(yrDeductiblePropTax),
        _totalItemized: Math.round(yrTotalItemized),
        _stdDed: yrStdDed,
        _excessItemized: Math.round(Math.max(yrTotalItemized - yrStdDed, 0)),
        _marginalRate: yrMarginalRate,
        _income: Math.round(currentIncome),
      });
    }
    return chartData;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    homePrice, downPaymentPct, interestRate, loanTerm, propertyTaxRate,
    homeInsurance, homeInsuranceIncrease, monthlyHOA, hoaIncrease,
    monthlyMelloRoos, maintenanceRate, appreciationRate, monthlyRent, monthlyParking,
    rentIncrease, renterInsurance, renterInsuranceIncrease, movingCost, moveFrequency, investmentReturn, yearsToAnalyze,
    marginalTaxRate, selectedState, buyingClosingCostsPct, sellingCostsPct,
    filingStatus, otherDeductions, saltCap, householdIncome, salaryIncrease,
  ]);

  const breakEvenYear = data.find((d) => d['Break Even'] > 0)?.year;
  const lastRow = data[data.length - 1];

  // --- Rental property scenario ---
  const rentalData = useMemo(() => {
    if (viewMode !== 'rental') return [];

    const downPaymentAmount = homePrice * (downPaymentPct / 100);
    const loanAmount = homePrice - downPaymentAmount;
    const initialClosingCosts = homePrice * (buyingClosingCostsPct / 100);
    const initialOutlay = downPaymentAmount + initialClosingCosts;
    const monthlyRate = (interestRate / 100) / 12;
    const numPayments = loanTerm * 12;
    const monthlyPI =
      loanAmount *
      (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
      (Math.pow(1 + monthlyRate, numPayments) - 1);
    const annualDepreciation = (homePrice * 0.85) / 27.5; // land ~15%, depreciate structure over 27.5yr

    let currentHomeValue = homePrice;
    let assessedValue = homePrice;
    let currentLoanBalance = loanAmount;
    let currentMonthlyHOA = monthlyHOA;
    let currentHomeInsurance = homeInsurance;
    let currentMelloRoos = monthlyMelloRoos;
    let currentRentalIncome = rentalIncome;
    let currentNewRent = newRent;
    let investedSavings = 0;
    let neverBoughtWealth = initialOutlay; // if you never bought, invest the down payment
    let currentIncome = householdIncome;
    const monthlyInvestRate = (investmentReturn / 100) / 12;

    const result: Array<{
      year: number;
      'Landlord Net Wealth': number;
      'Never Bought Wealth': number;
      'Net If Sold': number;
      _rentalIncome: number;
      _vacancyLoss: number;
      _mgmtFee: number;
      _netRentalIncome: number;
      _yearlyExpenses: number;
      _propertyCashFlow: number;
      _yourRent: number;
      _depreciation: number;
      _taxBenefit: number;
      _totalOutlay: number;
      _capitalGain: number;
      _taxableGain: number;
      _capitalGainsTax: number;
      _isRental: boolean;
      _marginalRate: number;
      _homeValue: number;
      _loanBalance: number;
      _sellingFees: number;
      _cgExclusion: number;
      _ltcgRate: number;
      _depreciationRecapture: number;
      _recaptureTax: number;
      _hasExclusion: boolean;
    }> = [];

    for (let year = 1; year <= yearsToAnalyze; year++) {
      const isRental = year >= convertYear;
      const yrMarginalRate = deriveMarginalRate(currentIncome, filingStatus, preset.stateTaxRate);
      const yearlyTax = assessedValue * (propertyTaxRate / 100);
      const yearlyMaint = currentHomeValue * (maintenanceRate / 100);
      const yearlyHOA = currentMonthlyHOA * 12;
      const yearlyMelloRoos = currentMelloRoos * 12;
      const yearlyExpenses = (monthlyPI * 12) + yearlyTax + yearlyMaint + currentHomeInsurance + yearlyHOA + yearlyMelloRoos;

      let propertyCashFlow = 0;
      let yrRentalIncome = 0;
      let yrVacancyLoss = 0;
      let yrMgmtFee = 0;
      let yrNetRentalIncome = 0;
      let yrYourRent = 0;
      let yrDepreciation = 0;
      let yrTaxBenefit = 0;

      if (isRental) {
        // Rental income after vacancy and management
        yrRentalIncome = currentRentalIncome * 12;
        yrVacancyLoss = yrRentalIncome * (vacancyRate / 100);
        yrMgmtFee = (yrRentalIncome - yrVacancyLoss) * (propertyMgmtFee / 100);
        yrNetRentalIncome = yrRentalIncome - yrVacancyLoss - yrMgmtFee;

        propertyCashFlow = yrNetRentalIncome - yearlyExpenses;

        // Your new rent
        yrYourRent = currentNewRent * 12;

        // Tax benefits: depreciation + deductible expenses on rental
        yrDepreciation = annualDepreciation;
        // Rental losses can offset income (simplified): deductible expenses - rental income = loss
        const deductibleExpenses = yearlyTax + (currentLoanBalance * interestRate / 100) + currentHomeInsurance + yearlyMaint + yearlyHOA + yearlyMelloRoos + yrDepreciation;
        const taxableLoss = Math.max(deductibleExpenses - yrNetRentalIncome, 0);
        yrTaxBenefit = Math.min(taxableLoss, 25_000) * (yrMarginalRate / 100); // $25k passive loss limit
      } else {
        // Before conversion: same as primary residence
        const yearlyInterestForTax = (() => {
          let intTotal = 0;
          let bal = currentLoanBalance;
          for (let m = 0; m < 12; m++) {
            const intM = bal * monthlyRate;
            intTotal += bal > 750_000 ? intM * (750_000 / bal) : intM;
            bal -= (monthlyPI - intM);
          }
          return intTotal;
        })();
        const { savings } = calculateYearlyTaxSavings(yearlyInterestForTax, yearlyTax, yrMarginalRate);
        yrTaxBenefit = savings;
        propertyCashFlow = -yearlyExpenses + yrTaxBenefit;
      }

      // Update loan balance
      for (let m = 0; m < 12; m++) {
        const intM = currentLoanBalance * monthlyRate;
        currentLoanBalance -= (monthlyPI - intM);
      }

      // Total outlay for the year
      const totalOutlay = isRental
        ? yrYourRent + Math.max(-propertyCashFlow, 0) // rent + any negative cash flow
        : yearlyExpenses - yrTaxBenefit;

      // Invest positive cash flow or pay out of pocket
      if (isRental && propertyCashFlow > 0) {
        investedSavings += propertyCashFlow;
      }
      investedSavings *= (1 + investmentReturn / 100);

      // "Never bought" comparison: invest monthly
      for (let m = 0; m < 12; m++) {
        neverBoughtWealth *= (1 + monthlyInvestRate);
        // If never bought, you'd pay rent (same as newRent in rental scenario)
        // The difference between ownership total outlay and rent is invested
      }

      // Annual escalations
      currentHomeValue *= 1 + appreciationRate / 100;
      assessedValue = preset.hasProp13 ? assessedValue * 1.02 : currentHomeValue;
      currentMonthlyHOA *= 1 + hoaIncrease / 100;
      currentHomeInsurance *= 1 + homeInsuranceIncrease / 100;
      currentMelloRoos *= 1.02;
      currentRentalIncome *= 1 + rentalIncomeIncrease / 100;
      currentNewRent *= 1 + newRentIncrease / 100;
      currentIncome *= 1 + salaryIncrease / 100;

      // Net if sold — lose primary residence exclusion after 3 years as rental
      const estimatedSellingFees = currentHomeValue * (sellingCostsPct / 100);
      const grossProceeds = currentHomeValue - Math.max(currentLoanBalance, 0) - estimatedSellingFees;
      const capitalGain = currentHomeValue - homePrice;
      const yearsAsRental = isRental ? year - convertYear + 1 : 0;
      // Section 121: must have lived there 2 of last 5 years before sale
      const yearsLivedIn = convertYear - 1; // years as primary residence
      const yearsSinceMoveOut = isRental ? year - convertYear + 1 : 0;
      const hasExclusion = yearsLivedIn >= 2 && yearsSinceMoveOut <= 3;
      const cgExclusion = hasExclusion ? (filingStatus === 'married' ? 500_000 : 250_000) : 0;
      const taxableGain = Math.max(capitalGain - cgExclusion, 0);
      const ltcgRate = currentIncome > 500_000 ? 20 : 15;
      // Depreciation recapture taxed at 25%
      const depreciationRecapture = isRental ? Math.min(yearsAsRental * annualDepreciation, capitalGain) : 0;
      const recaptureTax = depreciationRecapture * 0.25;
      const capitalGainsTax = (taxableGain * (ltcgRate / 100)) + recaptureTax;
      const netIfSold = grossProceeds - capitalGainsTax;

      const landlordWealth = netIfSold + investedSavings;

      result.push({
        year,
        'Landlord Net Wealth': Math.round(landlordWealth),
        'Never Bought Wealth': Math.round(neverBoughtWealth),
        'Net If Sold': Math.round(netIfSold),
        _rentalIncome: Math.round(yrRentalIncome),
        _vacancyLoss: Math.round(yrVacancyLoss),
        _mgmtFee: Math.round(yrMgmtFee),
        _netRentalIncome: Math.round(yrNetRentalIncome),
        _yearlyExpenses: Math.round(yearlyExpenses),
        _propertyCashFlow: Math.round(propertyCashFlow),
        _yourRent: Math.round(yrYourRent),
        _depreciation: Math.round(yrDepreciation),
        _taxBenefit: Math.round(yrTaxBenefit),
        _totalOutlay: Math.round(totalOutlay),
        _capitalGain: Math.round(capitalGain),
        _taxableGain: Math.round(taxableGain),
        _capitalGainsTax: Math.round(capitalGainsTax),
        _isRental: isRental,
        _marginalRate: yrMarginalRate,
        _homeValue: Math.round(currentHomeValue),
        _loanBalance: Math.round(Math.max(currentLoanBalance, 0)),
        _sellingFees: Math.round(estimatedSellingFees),
        _cgExclusion: cgExclusion,
        _ltcgRate: ltcgRate,
        _depreciationRecapture: Math.round(depreciationRecapture),
        _recaptureTax: Math.round(recaptureTax),
        _hasExclusion: hasExclusion,
      });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    viewMode, homePrice, downPaymentPct, interestRate, loanTerm, propertyTaxRate,
    homeInsurance, homeInsuranceIncrease, monthlyHOA, hoaIncrease, monthlyMelloRoos,
    maintenanceRate, appreciationRate, rentalIncome, rentalIncomeIncrease,
    vacancyRate, propertyMgmtFee, convertYear, newRent, newRentIncrease,
    investmentReturn, yearsToAnalyze, filingStatus, householdIncome, salaryIncrease,
    buyingClosingCostsPct, sellingCostsPct, saltCap, otherDeductions, selectedState,
  ]);

  const rentalBreakEven = rentalData.find(
    (d) => d['Landlord Net Wealth'] > d['Never Bought Wealth']
  )?.year;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 rounded-xl text-white shadow-lg">
              <Scale size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Smart Rent vs. Buy</h1>
              <p className="text-slate-500">Yearly Cash Flow &amp; Tax Itemization Analysis</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex gap-1 p-1 bg-slate-200 rounded-xl">
              {([['primary', 'Primary Res.'], ['rental', 'Rental Prop.']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    viewMode === mode ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
              <Clock size={16} className="text-slate-400" />
              <label className="text-xs font-semibold text-slate-500">Years</label>
              <input
                type="number"
                min={1}
                max={40}
                value={yearsToAnalyze}
                onChange={(e) => setYearsToAnalyze(parseInt(e.target.value) || 15)}
                className="w-14 bg-transparent border-none focus:ring-0 text-sm font-semibold text-center"
              />
            </div>

            <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
              <MapPin size={18} className="text-slate-400 ml-2" />
              <select
                value={selectedState}
                onChange={(e) => handleStateChange(e.target.value)}
                className="bg-transparent border-none focus:ring-0 text-sm font-semibold pr-8 cursor-pointer"
              >
                {Object.keys(STATE_PRESETS).map((key) => (
                  <option key={key} value={key}>
                    {STATE_PRESETS[key].name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* ============================================================= */}
          {/* INPUT SIDEBAR                                                  */}
          {/* ============================================================= */}
          <div className="lg:col-span-4 space-y-6">
            {/* Personal Tax Profile */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-indigo-700">
                <Users size={20} /> Personal Tax Profile
              </h2>
              <div className="space-y-4">
                <InputGroup label="Annual Income" value={householdIncome} onChange={setHouseholdIncome} icon={<DollarSign size={14} />} />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Filing Status</label>
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                    {(['single', 'married'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => setFilingStatus(status)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all capitalize ${
                          filingStatus === status ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <InputGroup label="Other Itemized Deductions" value={otherDeductions} onChange={setOtherDeductions} icon={<DollarSign size={14} />} />
                  <span className="text-[10px] text-slate-400">Charitable giving, medical expenses, HSA, etc.</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="SALT Cap" value={saltCap} onChange={setSaltCap} icon={<DollarSign size={14} />} />
                  <InputGroup label="Salary Inc. %" value={salaryIncrease} onChange={setSalaryIncrease} icon={<TrendingUp size={14} />} step={0.5} />
                </div>
                <ReadOnlyField
                  label="Est. Marginal Tax Rate"
                  value={`${marginalTaxRate.toFixed(1)}%`}
                  sublabel={`Fed ${(marginalTaxRate - preset.stateTaxRate).toFixed(0)}% + State ${preset.stateTaxRate}%`}
                />
                <ReadOnlyField
                  label="Standard Deduction"
                  value={`$${fmt(getStandardDeduction(filingStatus))}`}
                  sublabel={filingStatus === 'married' ? 'Married filing jointly' : 'Single filer'}
                />
              </div>
            </div>

            {/* Purchase Parameters */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-700">
                <Home size={20} /> Purchase Parameters
              </h2>
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Property Type</label>
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                    {(['condo', 'sfh'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => handlePropertyTypeChange(type)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                          propertyType === type ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'
                        }`}
                      >
                        {type === 'sfh' ? 'Single Family' : 'Condo / Townhome'}
                      </button>
                    ))}
                  </div>
                </div>
                <InputGroup label="Home Price" value={homePrice} onChange={setHomePrice} icon={<DollarSign size={14} />} />
                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Down Payment %" value={downPaymentPct} onChange={setDownPaymentPct} icon={<Percent size={14} />} step={1} />
                  <InputGroup label="Interest %" value={interestRate} onChange={setInterestRate} icon={<Percent size={14} />} step={0.1} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Loan Term (yrs)" value={loanTerm} onChange={setLoanTerm} icon={<Clock size={14} />} step={1} />
                  <InputGroup label="Property Tax %" value={propertyTaxRate} onChange={setPropertyTaxRate} icon={<Percent size={14} />} step={0.01} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Monthly HOA" value={monthlyHOA} onChange={setMonthlyHOA} icon={<Building size={14} />} />
                  <InputGroup label="HOA Inc. %" value={hoaIncrease} onChange={setHoaIncrease} icon={<TrendingUp size={14} />} step={0.1} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Home Insur. (yr)" value={homeInsurance} onChange={setHomeInsurance} icon={<ShieldCheck size={14} />} />
                  <InputGroup label="Insur. Inc. %" value={homeInsuranceIncrease} onChange={setHomeInsuranceIncrease} icon={<TrendingUp size={14} />} step={0.1} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Maintenance %" value={maintenanceRate} onChange={setMaintenanceRate} icon={<Percent size={14} />} step={0.1} />
                  <InputGroup label="Appreciation %" value={appreciationRate} onChange={setAppreciationRate} icon={<TrendingUp size={14} />} step={0.1} />
                </div>
                {preset.hasMelloRoos && (
                  <InputGroup label="Monthly Mello-Roos" value={monthlyMelloRoos} onChange={setMonthlyMelloRoos} icon={<Tag size={14} />} />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Buy Fee %" value={buyingClosingCostsPct} onChange={setBuyingClosingCostsPct} icon={<Tag size={14} />} step={0.1} />
                  <InputGroup label="Sell Fee %" value={sellingCostsPct} onChange={setSellingCostsPct} icon={<Tag size={14} />} step={0.1} />
                </div>
              </div>
            </div>

            {viewMode === 'primary' ? (
              /* Renting Parameters */
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-emerald-700">
                  <Key size={20} /> Renting Parameters
                </h2>
                <div className="space-y-4">
                  <InputGroup label="Monthly Rent" value={monthlyRent} onChange={setMonthlyRent} icon={<DollarSign size={14} />} />
                  <InputGroup label="Monthly Parking" value={monthlyParking} onChange={setMonthlyParking} icon={<DollarSign size={14} />} />
                  <InputGroup label="Rent Increase %" value={rentIncrease} onChange={setRentIncrease} icon={<TrendingUp size={14} />} step={0.1} />
                  <div className="grid grid-cols-2 gap-3">
                    <InputGroup label="Renter Insur. (yr)" value={renterInsurance} onChange={setRenterInsurance} icon={<ShieldCheck size={14} />} />
                    <InputGroup label="Insur. Inc. %" value={renterInsuranceIncrease} onChange={setRenterInsuranceIncrease} icon={<TrendingUp size={14} />} step={0.1} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <InputGroup label="Moving Cost" value={movingCost} onChange={setMovingCost} icon={<DollarSign size={14} />} />
                    <InputGroup label="Move Every (yrs)" value={moveFrequency} onChange={setMoveFrequency} icon={<Clock size={14} />} step={1} />
                  </div>
                  <InputGroup label="Investment Return %" value={investmentReturn} onChange={setInvestmentReturn} icon={<TrendingUp size={14} />} step={0.1} />
                </div>
              </div>
            ) : (
              /* Rental Property Parameters */
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-amber-200">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-amber-700">
                  <Building size={20} /> Rental Property Scenario
                </h2>
                <div className="space-y-4">
                  <InputGroup label="Convert to Rental (yr)" value={convertYear} onChange={setConvertYear} icon={<Calendar size={14} />} step={1} />
                  <InputGroup label="Rental Income (mo)" value={rentalIncome} onChange={setRentalIncome} icon={<DollarSign size={14} />} />
                  <InputGroup label="Rental Inc. Increase %" value={rentalIncomeIncrease} onChange={setRentalIncomeIncrease} icon={<TrendingUp size={14} />} step={0.5} />
                  <div className="grid grid-cols-2 gap-3">
                    <InputGroup label="Vacancy %" value={vacancyRate} onChange={setVacancyRate} icon={<Percent size={14} />} step={1} />
                    <InputGroup label="Mgmt Fee %" value={propertyMgmtFee} onChange={setPropertyMgmtFee} icon={<Percent size={14} />} step={1} />
                  </div>
                  <div className="pt-3 border-t border-slate-200">
                    <p className="text-xs text-slate-500 mb-3 font-medium uppercase">Your New Rent (after moving out)</p>
                    <InputGroup label="New Monthly Rent" value={newRent} onChange={setNewRent} icon={<DollarSign size={14} />} />
                    <div className="mt-3">
                      <InputGroup label="New Rent Inc. %" value={newRentIncrease} onChange={setNewRentIncrease} icon={<TrendingUp size={14} />} step={0.5} />
                    </div>
                  </div>
                  <InputGroup label="Investment Return %" value={investmentReturn} onChange={setInvestmentReturn} icon={<TrendingUp size={14} />} step={0.1} />
                </div>
              </div>
            )}
          </div>

          {/* ============================================================= */}
          {/* ANALYSIS MAIN SECTION                                          */}
          {/* ============================================================= */}
          <div className="lg:col-span-8 space-y-6">
            {viewMode === 'primary' && (
            <>
            {/* Monthly Cash Flow Card (read-only) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ReadOnlyCard
                label="Monthly Buy Cost (Net)"
                value={`$${fmt(initialCalculations.monthlyBuyNet)}`}
                color="text-blue-600"
              />
              <ReadOnlyCard
                label="Monthly Rent Cost"
                value={`$${fmt(initialCalculations.monthlyRentTotal)}`}
                color="text-emerald-600"
              />
              <ReadOnlyCard
                label="Monthly Difference"
                value={`$${fmt(Math.abs(initialCalculations.monthlyDiff))}`}
                sublabel={
                  initialCalculations.monthlyDiff > 0
                    ? 'Renter invests the difference'
                    : 'Buyer invests the difference'
                }
                color={initialCalculations.monthlyDiff > 0 ? 'text-orange-600' : 'text-emerald-600'}
              />
            </div>

            {/* Status Summary */}
            <div
              className={`p-6 rounded-2xl border-2 flex flex-col md:flex-row items-center justify-between gap-4 ${
                breakEvenYear ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${breakEvenYear ? 'bg-blue-600' : 'bg-orange-500'} text-white`}>
                  <Info size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold">
                    {breakEvenYear
                      ? `Buying beats Renting in Year ${breakEvenYear}.`
                      : 'Renting leads for this time horizon.'}
                  </h3>
                  <p className="text-sm opacity-80">Factoring in wealth building + opportunity costs.</p>
                </div>
              </div>
              <div className="text-2xl font-black text-slate-800">
                {breakEvenYear ? `Year ${breakEvenYear}` : 'Never'}
              </div>
            </div>

            {/* Chart */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold mb-6">Net Wealth Accumulation</h2>
              <div className="h-96 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                    <defs>
                      <linearGradient id="colorBuy" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorRent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="year" />
                    <YAxis tickFormatter={fmtK} />
                    <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                    <Legend verticalAlign="top" height={36} />
                    <Area type="monotone" dataKey="Buy Net Wealth" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorBuy)" />
                    <Area type="monotone" dataKey="Rent Net Wealth" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRent)" />
                    <Area type="monotone" dataKey="Net If Sold" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" fillOpacity={0} fill="none" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Net If Sold Breakdown */}
            {(() => {
              const saleRow = data[Math.min(soldYear, yearsToAnalyze) - 1];
              if (!saleRow) return null;
              return (
                <div className="bg-purple-950 rounded-2xl p-6 shadow-xl text-white">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold flex items-center gap-2 text-purple-400 uppercase tracking-widest">
                      <DollarSign size={16} /> If You Sold in Year
                    </h2>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={1}
                        max={yearsToAnalyze}
                        value={Math.min(soldYear, yearsToAnalyze)}
                        onChange={(e) => setSoldYear(parseInt(e.target.value))}
                        className="w-32 accent-purple-500"
                      />
                      <span className="text-lg font-black text-purple-300 w-8 text-center">{Math.min(soldYear, yearsToAnalyze)}</span>
                    </div>
                  </div>
                  <div className="text-sm space-y-2 font-mono">
                    <div className="flex justify-between text-slate-300">
                      <span>Home Value:</span>
                      <span>${fmt(saleRow._homeValue)}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>- Remaining Loan:</span>
                      <span>-${fmt(saleRow._loanBalance)}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>- Selling Fees ({sellingCostsPct}%):</span>
                      <span>-${fmt(saleRow._sellingFees)}</span>
                    </div>
                    <div className="pt-2 border-t border-purple-800 flex justify-between text-slate-300">
                      <span>Capital Gain:</span>
                      <span>${fmt(saleRow._capitalGain)}</span>
                    </div>
                    <div className="text-xs text-purple-400 pl-2">
                      = ${fmt(saleRow._homeValue)} - ${fmt(homePrice)} (purchase price)
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>- Exclusion ({filingStatus === 'married' ? 'married $500k' : 'single $250k'}):</span>
                      <span>-${fmt(saleRow._cgExclusion)}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>= Taxable Gain:</span>
                      <span className={saleRow._taxableGain > 0 ? 'text-orange-400' : 'text-emerald-400'}>
                        ${fmt(saleRow._taxableGain)}
                      </span>
                    </div>
                    {saleRow._taxableGain > 0 && (
                      <div className="flex justify-between text-slate-300">
                        <span>- Capital Gains Tax ({saleRow._ltcgRate}%):</span>
                        <span className="text-red-400">-${fmt(saleRow._capitalGainsTax)}</span>
                      </div>
                    )}
                    <div className="pt-3 border-t border-purple-800 flex justify-between text-lg font-black text-purple-300">
                      <span>NET CASH FROM SALE:</span>
                      <span>${fmt(saleRow['Net If Sold'])}</span>
                    </div>
                    {saleRow._taxableGain === 0 && (
                      <div className="text-xs text-emerald-400 mt-1">
                        Gain is within the {filingStatus === 'married' ? '$500k' : '$250k'} exclusion — no capital gains tax owed.
                      </div>
                    )}
                  </div>

                  {/* Verdict: Buy vs Rent at this year */}
                  {(() => {
                    const buyTotal = saleRow['Net If Sold'];
                    const rentTotal = saleRow['Rent Net Wealth'];
                    const diff = buyTotal - rentTotal;
                    const buyWins = diff > 0;
                    return (
                      <div className={`mt-6 p-4 rounded-xl border ${buyWins ? 'bg-blue-500/10 border-blue-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                        <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                          <div>
                            <span className="text-slate-400 text-xs uppercase">You (sold in yr {Math.min(soldYear, yearsToAnalyze)})</span>
                            <div className="text-lg font-bold text-purple-300">${fmt(buyTotal)}</div>
                          </div>
                          <div>
                            <span className="text-slate-400 text-xs uppercase">If you had rented instead</span>
                            <div className="text-lg font-bold text-emerald-300">${fmt(rentTotal)}</div>
                          </div>
                        </div>
                        <div className={`flex items-center gap-2 text-sm font-bold ${buyWins ? 'text-blue-300' : 'text-emerald-300'}`}>
                          <ArrowRightLeft size={16} />
                          <span>
                            {buyWins
                              ? `Buying and selling won by $${fmt(diff)}`
                              : `Renting would have left you $${fmt(Math.abs(diff))} ahead`}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* Annual Cash Flow Breakdown (Black Tile) */}
            {(() => {
              const yr = data[Math.min(breakdownYear, yearsToAnalyze) - 1];
              if (!yr) return null;
              const bdy = Math.min(breakdownYear, yearsToAnalyze);
              return (
                <div className="bg-slate-900 rounded-2xl p-6 shadow-xl text-white">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-sm font-bold flex items-center gap-2 text-blue-400 uppercase tracking-widest">
                        <Wallet size={16} /> Annual Cash Flow Breakdown
                      </h2>
                      <p className="text-slate-400 text-xs mt-1">Comparing total out-of-pocket expenses for both options.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div
                        className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                          yr._itemizing
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {yr._itemizing ? 'Itemized' : 'Std Deduction'}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Year</span>
                        <input
                          type="range"
                          min={1}
                          max={yearsToAnalyze}
                          value={bdy}
                          onChange={(e) => setBreakdownYear(parseInt(e.target.value))}
                          className="w-24 accent-blue-500"
                        />
                        <span className="text-lg font-black text-blue-300 w-8 text-center">{bdy}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Buy Side */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-blue-400 uppercase border-b border-slate-800 pb-2">
                        Buying (Cash Out)
                      </h3>
                      <div className="space-y-2 text-sm">
                        <BreakdownRow label="Mortgage (P&I)" value={yr._yearlyPI} />
                        <BreakdownRow label="Property Taxes" value={yr._yearlyTax} />
                        <BreakdownRow label="Home Insurance" value={yr._yearlyHomeInsurance} />
                        <BreakdownRow label="Maintenance (Est.)" value={yr._yearlyMaint} />
                        <BreakdownRow label="HOA Fees" value={yr._yearlyHOA} />
                        {yr._yearlyMelloRoos > 0 && (
                          <BreakdownRow label="Mello-Roos" value={yr._yearlyMelloRoos} />
                        )}
                        <div className="pt-2 border-t border-slate-800 flex justify-between font-bold">
                          <span className="text-slate-400">Gross Yearly Outlay:</span>
                          <span>${fmt(yr._yearlyBuyGross)}</span>
                        </div>
                        <div className="flex justify-between text-emerald-400 text-xs font-medium">
                          <span>Est. Tax Savings:</span>
                          <span>-${fmt(yr._yearlyTaxBenefit)}</span>
                        </div>
                        <div className="pt-3 flex justify-between text-lg font-black text-blue-300 border-t border-slate-800">
                          <span>NET YEARLY COST:</span>
                          <span>${fmt(yr._yearlyBuyNet)}</span>
                        </div>
                        <FormulaRow formula={`$${fmt(yr._yearlyBuyGross)} - $${fmt(yr._yearlyTaxBenefit)}`} />
                      </div>
                    </div>

                    {/* Rent Side */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-emerald-400 uppercase border-b border-slate-800 pb-2">
                        Renting (Cash Out)
                      </h3>
                      <div className="space-y-2 text-sm">
                        <BreakdownRow label="Annual Rent" value={yr._yearlyRent} />
                        {yr._yearlyParking > 0 && (
                          <BreakdownRow label="Parking" value={yr._yearlyParking} />
                        )}
                        <BreakdownRow label="Renter's Insurance" value={yr._yearlyRenterInsurance} />
                        {yr._yearlyMovingCost > 0 && (
                          <BreakdownRow label="Moving (amort.)" value={yr._yearlyMovingCost} />
                        )}
                        <div className="h-4" />
                        <div className="pt-3 flex justify-between text-lg font-black text-emerald-300 border-t border-slate-800">
                          <span>NET YEARLY COST:</span>
                          <span>${fmt(yr._yearlyRentTotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tax Savings Math */}
                  <div className="mt-6 p-4 rounded-xl bg-slate-800/50 border border-slate-700 space-y-2">
                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Tax Savings Math (Year {bdy})</h4>
                    <div className="text-xs text-slate-400 space-y-1 font-mono">
                      <p>Mortgage Interest: <span className="text-slate-200">${fmt(yr._firstYearInterest)}</span></p>
                      <p>+ Deductible Prop Tax: <span className="text-slate-200">${fmt(yr._deductiblePropTax)}</span>
                        {yr._yearlyTax > saltCap && <span className="text-amber-400"> (SALT capped from ${fmt(yr._yearlyTax)})</span>}
                      </p>
                      {otherDeductions > 0 && (
                        <p>+ Other Deductions: <span className="text-slate-200">${fmt(otherDeductions)}</span></p>
                      )}
                      <p className="border-t border-slate-700 pt-1">= Total Itemized: <span className="text-slate-200">${fmt(yr._totalItemized)}</span></p>
                      <p>- Standard Deduction: <span className="text-slate-200">${fmt(yr._stdDed)}</span></p>
                      <p className="border-t border-slate-700 pt-1">= Excess: <span className={yr._excessItemized > 0 ? 'text-emerald-400' : 'text-orange-400'}>
                        ${fmt(yr._excessItemized)}
                      </span></p>
                      <p>x Marginal Rate: <span className="text-slate-200">{yr._marginalRate.toFixed(1)}%</span>{yr._income !== householdIncome && <span className="text-amber-400"> (income: ${fmt(yr._income)})</span>}</p>
                      <p className="border-t border-slate-700 pt-1 text-sm font-bold">= Tax Savings: <span className="text-emerald-400">${fmt(yr._yearlyTaxBenefit)}/yr</span></p>
                    </div>
                  </div>

                  <div
                    className={`mt-6 p-4 rounded-xl flex items-center justify-between ${
                      yr._yearlyDiff > 0
                        ? 'bg-orange-500/10 border border-orange-500/20 text-orange-200'
                        : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <ArrowRightLeft size={16} />
                      <span>Year {bdy} Cash Gap:</span>
                    </div>
                    <span className="text-xl font-black">
                      ${fmt(Math.abs(yr._yearlyDiff))} / year
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Tax Benefit Explainer */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <button
                onClick={() => setShowTaxExplainer(!showTaxExplainer)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
              >
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Info size={16} className="text-indigo-500" />
                  How the Tax Benefit Works
                </span>
                {showTaxExplainer ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showTaxExplainer && (
                <div className="px-6 pb-6 text-sm text-slate-600 space-y-3">
                  <p>
                    <strong>Standard Deduction Hurdle:</strong> Everyone gets a standard deduction ($
                    {fmt(getStandardDeduction(filingStatus))} for {filingStatus === 'married' ? 'married filers' : 'single filers'}).
                    Buying only saves you money on taxes if your total itemized deductions (mortgage interest +
                    property taxes + other) <em>exceed</em> this amount.
                  </p>
                  <p>
                    <strong>SALT Cap (${fmt(saltCap)}):</strong> The State and Local Tax deduction is
                    capped. Even if your property taxes are $15k/yr, you can only deduct up to the cap.
                  </p>
                  <p>
                    <strong>Mortgage Interest Deduction ($750k Limit):</strong> You can only deduct interest
                    on the first $750,000 of mortgage debt. On a $1.2M loan, roughly 62.5% of your interest qualifies.
                  </p>
                  <p>
                    <strong>The Subsidy Effect:</strong> When you itemize, the government effectively pays back
                    a portion of your housing costs equal to your marginal tax rate ({marginalTaxRate.toFixed(1)}%)
                    times the amount your deductions exceed the standard deduction.
                  </p>
                </div>
              )}
            </div>

            {/* Final wealth stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatCard
                title="Renter Net Wealth"
                value={lastRow['Rent Net Wealth']}
                subtitle={`After ${yearsToAnalyze} years (portfolio value)`}
                color="text-emerald-600"
              />
              <StatCard
                title="Buyer Net Wealth"
                value={lastRow['Buy Net Wealth']}
                subtitle={`Equity + investment savings after ${yearsToAnalyze} years`}
                color="text-blue-600"
              />
            </div>
            </>
            )}

            {/* ============================================================= */}
            {/* RENTAL PROPERTY VIEW                                           */}
            {/* ============================================================= */}
            {viewMode === 'rental' && rentalData.length > 0 && (() => {
              const lastRental = rentalData[rentalData.length - 1];
              return (
                <>
                  {/* Status */}
                  <div className={`p-6 rounded-2xl border-2 flex flex-col md:flex-row items-center justify-between gap-4 ${
                    rentalBreakEven ? 'bg-amber-50 border-amber-200' : 'bg-orange-50 border-orange-200'
                  }`}>
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-full ${rentalBreakEven ? 'bg-amber-600' : 'bg-orange-500'} text-white`}>
                        <Building size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">
                          {rentalBreakEven
                            ? `Landlord scenario beats never-buying in Year ${rentalBreakEven}.`
                            : 'Never buying leads for this time horizon.'}
                        </h3>
                        <p className="text-sm opacity-80">
                          Convert to rental in year {convertYear}. Includes depreciation, vacancy, mgmt fees.
                        </p>
                      </div>
                    </div>
                    <div className="text-2xl font-black text-slate-800">
                      {rentalBreakEven ? `Year ${rentalBreakEven}` : 'Never'}
                    </div>
                  </div>

                  {/* Rental Chart */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                    <h2 className="text-lg font-semibold mb-6">Rental Property: Net Wealth</h2>
                    <div className="h-96 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={rentalData}>
                          <defs>
                            <linearGradient id="colorLandlord" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#d97706" stopOpacity={0.1} />
                              <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorNever" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="year" />
                          <YAxis tickFormatter={fmtK} />
                          <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                          <Legend verticalAlign="top" height={36} />
                          <Area type="monotone" dataKey="Landlord Net Wealth" stroke="#d97706" strokeWidth={3} fillOpacity={1} fill="url(#colorLandlord)" />
                          <Area type="monotone" dataKey="Never Bought Wealth" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorNever)" />
                          <Area type="monotone" dataKey="Net If Sold" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" fillOpacity={0} fill="none" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Rental Cash Flow Breakdown */}
                  {(() => {
                    const [rentalBreakdownYear, setRentalBreakdownYear_] = [breakdownYear, setBreakdownYear];
                    const rr = rentalData[Math.min(rentalBreakdownYear, yearsToAnalyze) - 1];
                    if (!rr) return null;
                    const rby = Math.min(rentalBreakdownYear, yearsToAnalyze);
                    return (
                      <div className="bg-slate-900 rounded-2xl p-6 shadow-xl text-white">
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <h2 className="text-sm font-bold flex items-center gap-2 text-amber-400 uppercase tracking-widest">
                              <Wallet size={16} /> Rental Property Cash Flow
                            </h2>
                            <p className="text-slate-400 text-xs mt-1">
                              {rr._isRental ? 'Property is rented out' : 'Living in property (pre-conversion)'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">Year</span>
                            <input
                              type="range" min={1} max={yearsToAnalyze}
                              value={rby}
                              onChange={(e) => setRentalBreakdownYear_(parseInt(e.target.value))}
                              className="w-24 accent-amber-500"
                            />
                            <span className="text-lg font-black text-amber-300 w-8 text-center">{rby}</span>
                          </div>
                        </div>

                        {rr._isRental ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Income Side */}
                            <div className="space-y-4">
                              <h3 className="text-xs font-bold text-amber-400 uppercase border-b border-slate-800 pb-2">Rental Income</h3>
                              <div className="space-y-2 text-sm">
                                <BreakdownRow label="Gross Rental Income" value={rr._rentalIncome} />
                                <BreakdownRow label="- Vacancy Loss" value={rr._vacancyLoss} muted />
                                <BreakdownRow label="- Mgmt Fees" value={rr._mgmtFee} muted />
                                <div className="pt-2 border-t border-slate-800 flex justify-between font-bold">
                                  <span className="text-slate-400">Net Rental Income:</span>
                                  <span>${fmt(rr._netRentalIncome)}</span>
                                </div>
                              </div>
                            </div>
                            {/* Expense Side */}
                            <div className="space-y-4">
                              <h3 className="text-xs font-bold text-red-400 uppercase border-b border-slate-800 pb-2">Expenses</h3>
                              <div className="space-y-2 text-sm">
                                <BreakdownRow label="Total Property Expenses" value={rr._yearlyExpenses} />
                                <BreakdownRow label="Your New Rent" value={rr._yourRent} />
                                <div className="flex justify-between text-emerald-400 text-xs font-medium">
                                  <span>Depreciation Tax Benefit:</span>
                                  <span>-${fmt(rr._taxBenefit)}</span>
                                </div>
                                <FormulaRow formula={`$${fmt(rr._depreciation)}/yr depreciation x ${rr._marginalRate.toFixed(1)}% rate`} />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-slate-400">
                            <p>Year {rby} is before conversion (year {convertYear}). You are living in the property as your primary residence.</p>
                            <div className="mt-3">
                              <BreakdownRow label="Property Expenses" value={rr._yearlyExpenses} />
                              <div className="flex justify-between text-emerald-400 text-xs font-medium mt-2">
                                <span>Tax Savings:</span>
                                <span>-${fmt(rr._taxBenefit)}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className={`mt-6 p-4 rounded-xl flex items-center justify-between ${
                          rr._propertyCashFlow > 0
                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200'
                            : 'bg-red-500/10 border border-red-500/20 text-red-200'
                        }`}>
                          <div className="flex items-center gap-2 text-sm font-bold">
                            <ArrowRightLeft size={16} />
                            <span>Property Cash Flow (Year {rby}):</span>
                          </div>
                          <span className="text-xl font-black">
                            {rr._propertyCashFlow >= 0 ? '+' : '-'}${fmt(Math.abs(rr._propertyCashFlow))} / year
                          </span>
                        </div>

                        {rr._isRental && (
                          <div className="mt-4 p-3 rounded-lg bg-slate-800/50 text-xs text-slate-400">
                            {convertYear - 1 < 2
                              ? <span className="text-red-400 font-bold">Lived there &lt; 2 years — no exclusion available (Section 121 requires 2-of-5 years).</span>
                              : rby - convertYear + 1 > 3
                                ? <span className="text-red-400 font-bold">Exclusion lost — more than 3 years since you moved out (fails 2-of-5 year test).</span>
                                : <span className="text-emerald-400">Within 3-year window — ${ filingStatus === 'married' ? '500k' : '250k'} exclusion still available.</span>
                            }
                            {' '}Depreciation recapture taxed at 25%.
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* If Sold Math (Rental) */}
                  {(() => {
                    const sr = rentalData[Math.min(soldYear, yearsToAnalyze) - 1];
                    if (!sr) return null;
                    const sy = Math.min(soldYear, yearsToAnalyze);
                    return (
                      <div className="bg-purple-950 rounded-2xl p-6 shadow-xl text-white">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-sm font-bold flex items-center gap-2 text-purple-400 uppercase tracking-widest">
                            <DollarSign size={16} /> If You Sold in Year
                          </h2>
                          <div className="flex items-center gap-2">
                            <input
                              type="range" min={1} max={yearsToAnalyze}
                              value={sy}
                              onChange={(e) => setSoldYear(parseInt(e.target.value))}
                              className="w-32 accent-purple-500"
                            />
                            <span className="text-lg font-black text-purple-300 w-8 text-center">{sy}</span>
                          </div>
                        </div>
                        <div className="text-sm space-y-2 font-mono">
                          <div className="flex justify-between text-slate-300">
                            <span>Home Value:</span>
                            <span>${fmt(sr._homeValue)}</span>
                          </div>
                          <div className="flex justify-between text-slate-300">
                            <span>- Remaining Loan:</span>
                            <span>-${fmt(sr._loanBalance)}</span>
                          </div>
                          <div className="flex justify-between text-slate-300">
                            <span>- Selling Fees ({sellingCostsPct}%):</span>
                            <span>-${fmt(sr._sellingFees)}</span>
                          </div>

                          <div className="pt-2 border-t border-purple-800 flex justify-between text-slate-300">
                            <span>Capital Gain:</span>
                            <span>${fmt(sr._capitalGain)}</span>
                          </div>
                          <div className="text-xs text-purple-400 pl-2">
                            = ${fmt(sr._homeValue)} - ${fmt(homePrice)} (purchase price)
                          </div>

                          {sr._hasExclusion ? (
                            <div className="flex justify-between text-slate-300">
                              <span>- Exclusion ({filingStatus === 'married' ? '$500k' : '$250k'}):</span>
                              <span>-${fmt(sr._cgExclusion)}</span>
                            </div>
                          ) : (
                            <div className="flex justify-between text-red-400">
                              <span>Exclusion:</span>
                              <span>$0 ({convertYear <= 2 ? 'lived there < 2 yrs' : 'rental > 3 yrs — fails 2-of-5 test'})</span>
                            </div>
                          )}

                          <div className="flex justify-between text-slate-300">
                            <span>= Taxable Gain:</span>
                            <span className={sr._taxableGain > 0 ? 'text-orange-400' : 'text-emerald-400'}>
                              ${fmt(sr._taxableGain)}
                            </span>
                          </div>

                          {sr._taxableGain > 0 && (
                            <div className="flex justify-between text-slate-300">
                              <span>- Capital Gains Tax ({sr._ltcgRate}%):</span>
                              <span className="text-red-400">-${fmt(Math.round(sr._taxableGain * sr._ltcgRate / 100))}</span>
                            </div>
                          )}

                          {sr._depreciationRecapture > 0 && (
                            <>
                              <div className="flex justify-between text-slate-300">
                                <span>- Depreciation Recapture (25%):</span>
                                <span className="text-red-400">-${fmt(sr._recaptureTax)}</span>
                              </div>
                              <div className="text-xs text-purple-400 pl-2">
                                = ${fmt(sr._depreciationRecapture)} recaptured x 25%
                              </div>
                            </>
                          )}

                          <div className="pt-3 border-t border-purple-800 flex justify-between text-lg font-black text-purple-300">
                            <span>NET CASH FROM SALE:</span>
                            <span>${fmt(sr['Net If Sold'])}</span>
                          </div>

                          {sr._taxableGain === 0 && sr._hasExclusion && (
                            <div className="text-xs text-emerald-400 mt-1">
                              Gain within exclusion — no capital gains tax.
                            </div>
                          )}
                        </div>

                        {/* Verdict */}
                        {(() => {
                          const landlordTotal = sr['Net If Sold'];
                          const neverTotal = sr['Never Bought Wealth'];
                          const diff = landlordTotal - neverTotal;
                          const wins = diff > 0;
                          return (
                            <div className={`mt-6 p-4 rounded-xl border ${wins ? 'bg-amber-500/10 border-amber-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                              <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                                <div>
                                  <span className="text-slate-400 text-xs uppercase">Sale proceeds (yr {sy})</span>
                                  <div className="text-lg font-bold text-purple-300">${fmt(landlordTotal)}</div>
                                </div>
                                <div>
                                  <span className="text-slate-400 text-xs uppercase">If you never bought</span>
                                  <div className="text-lg font-bold text-emerald-300">${fmt(neverTotal)}</div>
                                </div>
                              </div>
                              <div className={`flex items-center gap-2 text-sm font-bold ${wins ? 'text-amber-300' : 'text-emerald-300'}`}>
                                <ArrowRightLeft size={16} />
                                <span>
                                  {wins
                                    ? `Being a landlord won by $${fmt(diff)}`
                                    : `Never buying would have left you $${fmt(Math.abs(diff))} ahead`}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}

                  {/* Final wealth stats */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <StatCard
                      title="Never Bought Wealth"
                      value={lastRental['Never Bought Wealth']}
                      subtitle={`If you rented the whole time`}
                      color="text-emerald-600"
                    />
                    <StatCard
                      title="Landlord Net Wealth"
                      value={lastRental['Landlord Net Wealth']}
                      subtitle={`Property equity + invested cash flow`}
                      color="text-amber-600"
                    />
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FormulaRow({ formula }: { formula: string }) {
  return (
    <div className="text-[10px] text-slate-500 font-mono -mt-1 ml-2">
      = {formula}
    </div>
  );
}

function BreakdownRow({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`flex justify-between items-center ${muted ? 'text-slate-500' : 'text-slate-300'}`}>
      <span className="text-slate-400">{label}:</span>
      <span className="font-mono">${fmt(value)}</span>
    </div>
  );
}

function InputGroup({
  label,
  value,
  onChange,
  icon,
  step = 1000,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  icon: React.ReactNode;
  step?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          step={step}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
        />
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</label>
      <div className="bg-slate-100 border border-slate-200 rounded-lg py-2 px-3 text-sm font-semibold text-slate-700">
        {value}
      </div>
      {sublabel && <span className="text-[10px] text-slate-400">{sublabel}</span>}
    </div>
  );
}

function ReadOnlyCard({ label, value, sublabel, color }: { label: string; value: string; sublabel?: string; color: string }) {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</h4>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {sublabel && <p className="text-[10px] text-slate-400 mt-1">{sublabel}</p>}
    </div>
  );
}

function StatCard({ title, value, subtitle, color }: { title: string; value: number; subtitle: string; color: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <h4 className="text-sm font-semibold text-slate-500">{title}</h4>
      <div className={`text-2xl font-bold mt-1 ${color}`}>${value.toLocaleString()}</div>
      <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
    </div>
  );
}

export default App;
