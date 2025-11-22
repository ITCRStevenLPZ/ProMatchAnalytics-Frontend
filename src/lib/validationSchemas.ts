import Joi from 'joi';

// Player Validation Schema
export const playerSchema = Joi.object({
  player_id: Joi.string()
    .trim()
    .max(40)
    .pattern(/^[A-Za-z0-9_-]+$/)
    .allow('')
    .messages({
      'string.max': 'Player ID must not exceed 40 characters',
      'string.pattern.base': 'Player ID must use letters, numbers, underscores, or hyphens',
    }),
  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Player name is required',
      'string.min': 'Player name must be at least 2 characters',
      'string.max': 'Player name must not exceed 100 characters',
      'any.required': 'Player name is required',
    }),
  birth_date: Joi.string()
    .required()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .messages({
      'string.empty': 'Birth date is required',
      'string.pattern.base': 'Birth date must be in YYYY-MM-DD format',
      'any.required': 'Birth date is required',
    }),
  country_name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Country is required',
      'string.min': 'Country must be at least 2 characters',
      'string.max': 'Country must not exceed 100 characters',
      'any.required': 'Country is required',
    }),
  position: Joi.string()
    .valid('GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'SW', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST', 'LF', 'RF', 'SS')
    .required()
    .messages({
      'any.only': 'Invalid position selected',
      'any.required': 'Position is required',
    }),
  player_height: Joi.number()
    .min(100)
    .max(250)
    .required()
    .messages({
      'any.required': 'Height is required',
      'number.min': 'Height must be at least 100 cm',
      'number.max': 'Height must not exceed 250 cm',
      'number.base': 'Height must be a valid number',
    }),
  player_weight: Joi.number()
    .min(30)
    .max(150)
    .required()
    .messages({
      'any.required': 'Weight is required',
      'number.min': 'Weight must be at least 30 kg',
      'number.max': 'Weight must not exceed 150 kg',
      'number.base': 'Weight must be a valid number',
    }),
  i18n_names: Joi.object({
    en: Joi.string().trim().max(100).allow(''),
    es: Joi.string().trim().max(100).allow(''),
  })
    .optional()
    .messages({
      'string.max': 'Localized name must not exceed 100 characters',
    }),
}).unknown(true);

// Team Validation Schema
export const teamSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Team name is required',
      'string.min': 'Team name must be at least 2 characters',
      'string.max': 'Team name must not exceed 100 characters',
      'any.required': 'Team name is required',
    }),
  short_name: Joi.string()
    .min(2)
    .max(10)
    .required()
    .messages({
      'string.empty': 'Short name is required',
      'string.min': 'Short name must be at least 2 characters',
      'string.max': 'Short name must not exceed 10 characters',
      'any.required': 'Short name is required',
    }),
  country_name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Country is required',
      'string.min': 'Country must be at least 2 characters',
      'string.max': 'Country must not exceed 100 characters',
      'any.required': 'Country is required',
    }),
  gender: Joi.string()
    .valid('male', 'female')
    .required()
    .messages({
      'any.only': 'Gender must be either male or female',
      'any.required': 'Gender is required',
    }),
  manager: Joi.object({
    name: Joi.string()
      .min(2)
      .max(100)
      .required()
      .messages({
        'string.empty': 'Manager name is required',
        'string.min': 'Manager name must be at least 2 characters',
        'string.max': 'Manager name must not exceed 100 characters',
        'any.required': 'Manager name is required',
      }),
    country_name: Joi.string()
      .min(2)
      .max(100)
      .allow('', null)
      .optional()
      .messages({
        'string.min': 'Manager nationality must be at least 2 characters',
        'string.max': 'Manager nationality must not exceed 100 characters',
      }),
    start_date: Joi.string()
      .optional()
      .allow(null, '')
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .messages({
        'string.pattern.base': 'Start date must be in YYYY-MM-DD format',
      }),
  }).required(),
  i18n_names: Joi.object({
    en: Joi.string().trim().max(100).allow(''),
    es: Joi.string().trim().max(100).allow(''),
  })
    .optional()
    .messages({
      'string.max': 'Localized name must not exceed 100 characters',
    }),
}).unknown(true);

// Referee Validation Schema
export const refereeSchema = Joi.object({
  referee_id: Joi.string()
    .trim()
    .max(40)
    .pattern(/^[A-Za-z0-9_-]+$/)
    .allow('')
    .messages({
      'string.max': 'Referee ID must not exceed 40 characters',
      'string.pattern.base': 'Referee ID must use letters, numbers, underscores, or hyphens',
    }),
  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Referee name is required',
      'string.min': 'Referee name must be at least 2 characters',
      'string.max': 'Referee name must not exceed 100 characters',
      'any.required': 'Referee name is required',
    }),
  country_name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Country is required',
      'string.min': 'Country must be at least 2 characters',
      'string.max': 'Country must not exceed 100 characters',
      'any.required': 'Country is required',
    }),
  years_of_experience: Joi.number()
    .min(0)
    .max(50)
    .optional()
    .allow(null, '')
    .messages({
      'number.min': 'Years of experience must be at least 0',
      'number.max': 'Years of experience must not exceed 50',
      'number.base': 'Years of experience must be a valid number',
    }),
}).unknown(true);

// Venue Validation Schema
export const venueSchema = Joi.object({
  venue_id: Joi.string()
    .trim()
    .max(40)
    .pattern(/^[A-Za-z0-9_-]+$/)
    .allow('')
    .messages({
      'string.max': 'Venue ID must not exceed 40 characters',
      'string.pattern.base': 'Venue ID must use letters, numbers, underscores, or hyphens',
    }),
  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Venue name is required',
      'string.min': 'Venue name must be at least 2 characters',
      'string.max': 'Venue name must not exceed 100 characters',
      'any.required': 'Venue name is required',
    }),
  city: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.empty': 'City is required',
      'string.min': 'City must be at least 2 characters',
      'string.max': 'City must not exceed 100 characters',
      'any.required': 'City is required',
    }),
  country_name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Country is required',
      'string.min': 'Country must be at least 2 characters',
      'string.max': 'Country must not exceed 100 characters',
      'any.required': 'Country is required',
    }),
  capacity: Joi.number()
    .min(100)
    .max(200000)
    .optional()
    .allow(null, '')
    .messages({
      'number.min': 'Capacity must be at least 100',
      'number.max': 'Capacity must not exceed 200,000',
      'number.base': 'Capacity must be a valid number',
    }),
  surface: Joi.string()
    .valid('Natural Grass', 'Artificial Turf', 'Hybrid')
    .optional()
    .allow('')
    .messages({
      'any.only': 'Surface must be Natural Grass, Artificial Turf, or Hybrid',
    }),
  i18n_names: Joi.object({
    en: Joi.string().trim().max(100).allow(''),
    es: Joi.string().trim().max(100).allow(''),
  })
    .optional()
    .messages({
      'string.max': 'Localized name must not exceed 100 characters',
    }),
}).unknown(true);

// Competition Validation Schema
export const competitionSchema = Joi.object({
  competition_id: Joi.string()
    .trim()
    .max(40)
    .pattern(/^[A-Za-z0-9_-]+$/)
    .allow('')
    .messages({
      'string.max': 'Competition ID must not exceed 40 characters',
      'string.pattern.base': 'Competition ID must use letters, numbers, underscores, or hyphens',
    }),
  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Competition name is required',
      'string.min': 'Competition name must be at least 2 characters',
      'string.max': 'Competition name must not exceed 100 characters',
      'any.required': 'Competition name is required',
    }),
  short_name: Joi.string()
    .min(2)
    .max(20)
    .optional()
    .allow('')
    .messages({
      'string.min': 'Short name must be at least 2 characters',
      'string.max': 'Short name must not exceed 20 characters',
    }),
  gender: Joi.string()
    .valid('male', 'female')
    .required()
    .messages({
      'any.only': 'Gender must be either male or female',
      'any.required': 'Gender is required',
    }),
  country_name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Country is required',
      'string.min': 'Country must be at least 2 characters',
      'string.max': 'Country must not exceed 100 characters',
      'any.required': 'Country is required',
    }),
  i18n_names: Joi.object({
    en: Joi.string().trim().max(100).allow(''),
    es: Joi.string().trim().max(100).allow(''),
  })
    .optional()
    .messages({
      'string.max': 'Localized name must not exceed 100 characters',
    }),
}).unknown(true);
