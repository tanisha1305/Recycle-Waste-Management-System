/**
 * Format number using Kenyan numbering system
 * - Comma as thousands separator (1,000; 250,000; 12,500,000)
 * - Period as decimal separator (45.67)
 * @param num - Number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string
 */
export const formatKenyanNumber = (num: number, decimals: number = 2): string => {
  return num.toLocaleString('en-KE', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
};

/**
 * Format currency in KSH with Kenyan numbering
 * @param amount - Amount to format
 * @returns Formatted currency string with KSH prefix
 */
export const formatKSH = (amount: number): string => {
  return `KSH ${formatKenyanNumber(amount)}`;
};

/**
 * Parse formatted Kenyan number back to float
 * @param str - Formatted string like "1,234.56"
 * @returns Numeric value
 */
export const parseKenyanNumber = (str: string): number => {
  return parseFloat(str.replace(/,/g, ''));
};

/**
 * Format input field value with commas while typing
 * @param value - Input value (can be string or number)
 * @returns Formatted string with commas
 */
export const formatInputNumber = (value: string | number): string => {
  if (!value && value !== 0) return '';
  
  // Convert to string and remove existing commas
  const str = String(value).replace(/,/g, '');
  
  // Handle decimal point
  const parts = str.split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  return parts.length > 1 ? `${integerPart}.${parts[1]}` : integerPart;
};

/**
 * Handle number input change with auto-formatting
 * @param value - Raw input value
 * @param setter - State setter function
 */
export const handleNumberInput = (value: string, setter: (val: string) => void) => {
  // Remove all commas for processing
  const raw = value.replace(/,/g, '');
  
  // Validate it's a valid number input
  if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
    setter(raw);
  }
};

