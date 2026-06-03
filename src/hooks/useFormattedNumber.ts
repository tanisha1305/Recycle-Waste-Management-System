import { useState, useCallback } from 'react';
import { formatInputNumber, parseKenyanNumber } from '../utils/numberFormat';

/**
 * Custom hook for managing number inputs with automatic comma formatting
 * @param initialValue - Initial numeric value
 * @returns [displayValue, rawValue, handleChange, setValue]
 */
export const useFormattedNumber = (initialValue: number | string = '') => {
  const [rawValue, setRawValue] = useState<string>(String(initialValue));

  const handleChange = useCallback((value: string) => {
    // Remove all commas and non-numeric characters except decimal point
    const cleaned = value.replace(/[^\d.]/g, '');
    
    // Prevent multiple decimal points
    const parts = cleaned.split('.');
    const sanitized = parts.length > 1 
      ? `${parts[0]}.${parts.slice(1).join('')}`
      : cleaned;
    
    setRawValue(sanitized);
  }, []);

  const setValue = useCallback((value: number | string) => {
    setRawValue(String(value));
  }, []);

  const displayValue = formatInputNumber(rawValue);
  const numericValue = rawValue ? parseKenyanNumber(rawValue) : 0;

  return {
    displayValue,
    rawValue,
    numericValue,
    handleChange,
    setValue
  };
};
