import { useState, useCallback } from 'react';
import type { Schema, ValidationError } from 'joi';
import { getTranslationKeyForError } from '../lib/validationMessages';

export interface ValidationErrors {
  [key: string]: string;
}

export function useFormValidation<T extends object>(schema: Schema, translateFn?: (key: string) => string) {
  const [errors, setErrors] = useState<ValidationErrors>({});
  
  // Helper function to translate error message
  const translateError = useCallback((errorMessage: string): string => {
    const translationKey = getTranslationKeyForError(errorMessage);
    // If a translation function is provided and the key is different from the message, translate it
    if (translateFn && translationKey !== errorMessage) {
      return translateFn(translationKey);
    }
    // Otherwise return the original message
    return errorMessage;
  }, [translateFn]);

  /**
   * Validate a single field
   */
  const validateField = useCallback((name: string, value: any): string | null => {
    const fieldSchema = schema.extract(name);
    const { error } = fieldSchema.validate(value, { abortEarly: true });
    
    if (error) {
      return translateError(error.message);
    }
    return null;
  }, [schema, translateError]);

  /**
   * Validate entire form
   * Returns true if valid, false if invalid
   */
  const validateForm = useCallback((data: T): boolean => {
    const { error } = schema.validate(data, { abortEarly: false });
    
    if (error) {
      const validationErrors: ValidationErrors = {};
      error.details.forEach((detail: ValidationError['details'][0]) => {
        const fieldName = detail.path.join('.');
        validationErrors[fieldName] = translateError(detail.message);
      });
      setErrors(validationErrors);
      return false;
    }
    
    setErrors({});
    return true;
  }, [schema, translateError]);

  /**
   * Validate single field and update errors state
   */
  const validateAndSetFieldError = useCallback((name: string, value: any) => {
    const error = validateField(name, value);
    
    setErrors(prev => {
      if (error) {
        return { ...prev, [name]: error };
      } else {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      }
    });
  }, [validateField]);

  /**
   * Clear all validation errors
   */
  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  /**
   * Clear specific field error
   */
  const clearFieldError = useCallback((name: string) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[name];
      return newErrors;
    });
  }, []);

  /**
   * Set custom error for a field
   */
  const setFieldError = useCallback((name: string, message: string) => {
    setErrors(prev => ({ ...prev, [name]: message }));
  }, []);

  /**
   * Check if form has any errors
   */
  const hasErrors = useCallback((): boolean => {
    return Object.keys(errors).length > 0;
  }, [errors]);

  /**
   * Get error message for a specific field
   */
  const getFieldError = useCallback((name: string): string | undefined => {
    return errors[name];
  }, [errors]);

  return {
    errors,
    validateField,
    validateForm,
    validateAndSetFieldError,
    clearErrors,
    clearFieldError,
    setFieldError,
    hasErrors,
    getFieldError,
  };
}
