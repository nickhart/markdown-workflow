/**
 * Date utilities that respect testing overrides from config
 */

import { ProjectConfig } from '../core/schemas.js';

/**
 * Get the current date, respecting testing overrides
 */
export function getCurrentDate(config?: ProjectConfig): Date {
  // Check if we have a testing override for current date
  const overrideDate = config?.system?.testing?.override_current_date;

  if (overrideDate) {
    const parsedDate = new Date(overrideDate);
    if (isNaN(parsedDate.getTime())) {
      console.warn(`Invalid override_current_date: ${overrideDate}, using system date`);
      return new Date();
    }
    return parsedDate;
  }

  return new Date();
}

/**
 * Format a date according to the specified format
 */
export function formatDate(date: Date, format: string, config?: ProjectConfig): string {
  // Get timezone override if specified
  const timezoneOverride = config?.system?.testing?.override_timezone;

  // Create formatting options
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezoneOverride || undefined,
  };

  // Handle common format patterns
  switch (format.toUpperCase()) {
    case 'YYYY-MM-DD':
      return date.toISOString().split('T')[0];

    case 'YYYYMMDD':
      return date.toISOString().split('T')[0].replace(/-/g, '');

    case 'MM/DD/YYYY':
      return date.toLocaleDateString('en-US', options);

    case 'DD/MM/YYYY':
      return date.toLocaleDateString('en-GB', options);

    case 'ISO':
      return date.toISOString();

    case 'RFC2822':
      return date.toString();

    case 'UNIX':
      return Math.floor(date.getTime() / 1000).toString();

    case 'LONG_DATE':
      // Format as "Monday, July 28, 2025"
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: timezoneOverride || undefined,
      });

    default:
      // For custom formats, try to handle common patterns
      let formatted = format;

      // Year patterns
      formatted = formatted.replace(/YYYY/g, date.getFullYear().toString());
      formatted = formatted.replace(/YY/g, date.getFullYear().toString().slice(-2));

      // Month patterns
      const month = date.getMonth() + 1;
      formatted = formatted.replace(/MM/g, month.toString().padStart(2, '0'));
      formatted = formatted.replace(/M/g, month.toString());

      // Day patterns
      const day = date.getDate();
      formatted = formatted.replace(/DD/g, day.toString().padStart(2, '0'));
      formatted = formatted.replace(/D/g, day.toString());

      // Hour patterns (24-hour)
      const hour = date.getHours();
      formatted = formatted.replace(/HH/g, hour.toString().padStart(2, '0'));
      formatted = formatted.replace(/H/g, hour.toString());

      // Minute patterns
      const minute = date.getMinutes();
      formatted = formatted.replace(/mm/g, minute.toString().padStart(2, '0'));
      formatted = formatted.replace(/m/g, minute.toString());

      // Second patterns
      const second = date.getSeconds();
      formatted = formatted.replace(/ss/g, second.toString().padStart(2, '0'));
      formatted = formatted.replace(/s/g, second.toString());

      return formatted;
  }
}

/**
 * Get current date formatted according to collection ID format
 */
export function getCurrentDateForCollectionId(config?: ProjectConfig): string {
  const currentDate = getCurrentDate(config);
  const dateFormat = config?.system?.collection_id?.date_format || 'YYYYMMDD';
  return formatDate(currentDate, dateFormat, config);
}

/**
 * Get current date in ISO format for metadata
 */
export function getCurrentISODate(config?: ProjectConfig): string {
  const currentDate = getCurrentDate(config);
  return currentDate.toISOString();
}

/**
 * Generate a deterministic ID for testing purposes
 */
export function generateCollectionId(
  company: string,
  role: string,
  config?: ProjectConfig,
): string {
  const sanitizeSpaces = config?.system?.collection_id?.sanitize_spaces || '_';
  const maxLength = config?.system?.collection_id?.max_length || 50;
  const useDeterministicIds = config?.system?.testing?.deterministic_ids || false;

  // Sanitize company and role names
  const sanitizedCompany = company
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, sanitizeSpaces)
    .replace(/_+/g, '_'); // Collapse multiple underscores to single

  const sanitizedRole = role
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, sanitizeSpaces)
    .replace(/_+/g, '_'); // Collapse multiple underscores to single

  // Get date component
  let dateComponent: string;
  if (useDeterministicIds) {
    // Use the override date if available, otherwise use a fixed date for testing
    const currentDate = getCurrentDate(config);
    const dateFormat = config?.system?.collection_id?.date_format || 'YYYYMMDD';
    dateComponent = formatDate(currentDate, dateFormat, config);
  } else {
    dateComponent = getCurrentDateForCollectionId(config);
  }

  // Combine components
  const baseId = `${sanitizedCompany}_${sanitizedRole}_${dateComponent}`;

  // Truncate if necessary
  if (baseId.length > maxLength) {
    const availableLength = maxLength - dateComponent.length - 2; // -2 for two underscores
    const companyLength = Math.floor(availableLength * 0.6);
    const roleLength = availableLength - companyLength;

    let truncatedCompany = sanitizedCompany.substring(0, companyLength);
    let truncatedRole = sanitizedRole.substring(0, roleLength);

    // Remove trailing underscores from truncated parts
    truncatedCompany = truncatedCompany.replace(/_+$/, '');
    truncatedRole = truncatedRole.replace(/_+$/, '');

    const truncatedId = `${truncatedCompany}_${truncatedRole}_${dateComponent}`;
    // Collapse any multiple underscores that might have been created
    return truncatedId.replace(/_+/g, '_');
  }

  // Ensure no multiple underscores in the final result
  return baseId.replace(/_+/g, '_');
}

/**
 * Template variable for current date (used in template processing)
 */
export function getDateTemplateVariable(config?: ProjectConfig): string {
  return getCurrentISODate(config);
}
