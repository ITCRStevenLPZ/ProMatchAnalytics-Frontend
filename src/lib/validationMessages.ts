// Validation error message translation mappings
// Maps English error messages to translation keys

export const validationMessageMap: Record<string, string> = {
  // Player validation
  "Player name is required": "validationErrors.playerNameRequired",
  "Player name must be at least 2 characters": "validationErrors.playerNameMin",
  "Player name must not exceed 100 characters":
    "validationErrors.playerNameMax",
  "Player ID must not exceed 40 characters": "validationErrors.playerIdMax",
  "Player ID must use letters, numbers, underscores, or hyphens":
    "validationErrors.playerIdFormat",
  "Player ID already exists": "validationErrors.playerIdExists",
  "Birth date is required": "validationErrors.birthDateRequired",
  "Birth date must be in YYYY-MM-DD format": "validationErrors.birthDateFormat",
  "Invalid position selected": "validationErrors.invalidPosition",
  "Position is required": "validationErrors.positionRequired",
  "Height is required": "validationErrors.heightRequired",
  "Height must be at least 100 cm": "validationErrors.heightMin",
  "Height must not exceed 250 cm": "validationErrors.heightMax",
  "Height must be a valid number": "validationErrors.heightInvalid",
  "Weight is required": "validationErrors.weightRequired",
  "Weight must be at least 30 kg": "validationErrors.weightMin",
  "Weight must not exceed 150 kg": "validationErrors.weightMax",
  "Weight must be a valid number": "validationErrors.weightInvalid",

  // Team validation
  "Team name is required": "validationErrors.teamNameRequired",
  "Team name must be at least 2 characters": "validationErrors.teamNameMin",
  "Team name must not exceed 100 characters": "validationErrors.teamNameMax",
  "Short name is required": "validationErrors.shortNameRequired",
  "Short name must be at least 2 characters": "validationErrors.shortNameMin",
  "Short name must not exceed 10 characters": "validationErrors.shortNameMax",
  "Short name must not exceed 20 characters": "validationErrors.shortNameMax20",
  "Gender must be either male or female": "validationErrors.genderInvalid",
  "Gender is required": "validationErrors.genderRequired",
  "Team ID already exists": "validationErrors.teamIdExists",
  "Manager name is required": "validationErrors.managerNameRequired",
  "Manager name must be at least 2 characters":
    "validationErrors.managerNameMin",
  "Manager name must not exceed 100 characters":
    "validationErrors.managerNameMax",
  "Manager nationality is required":
    "validationErrors.managerNationalityRequired",
  "Manager nationality must be at least 2 characters":
    "validationErrors.managerNationalityMin",
  "Manager nationality must not exceed 100 characters":
    "validationErrors.managerNationalityMax",
  "Years of experience must be at least 0": "validationErrors.yearsExpMin",
  "Years of experience must not exceed 70": "validationErrors.yearsExpMax70",
  "Years of experience must not exceed 50": "validationErrors.yearsExpMax50",
  "Years of experience must be a valid number":
    "validationErrors.yearsExpInvalid",
  "Years of experience is required": "validationErrors.yearsExpRequired",
  "Start date must be in YYYY-MM-DD format": "validationErrors.startDateFormat",

  // Referee validation
  "Referee name is required": "validationErrors.refereeNameRequired",
  "Referee name must be at least 2 characters":
    "validationErrors.refereeNameMin",
  "Referee name must not exceed 100 characters":
    "validationErrors.refereeNameMax",
  "Referee ID must not exceed 40 characters": "validationErrors.refereeIdMax",
  "Referee ID must use letters, numbers, underscores, or hyphens":
    "validationErrors.refereeIdFormat",
  "Referee ID already exists": "validationErrors.refereeIdExists",

  // Venue validation
  "Venue name is required": "validationErrors.venueNameRequired",
  "Venue name must be at least 2 characters": "validationErrors.venueNameMin",
  "Venue name must not exceed 100 characters": "validationErrors.venueNameMax",
  "Venue ID must not exceed 40 characters": "validationErrors.venueIdMax",
  "Venue ID must use letters, numbers, underscores, or hyphens":
    "validationErrors.venueIdFormat",
  "Venue ID already exists": "validationErrors.venueIdExists",
  "City is required": "validationErrors.cityRequired",
  "City must be at least 2 characters": "validationErrors.cityMin",
  "City must not exceed 100 characters": "validationErrors.cityMax",
  "Country is required": "validationErrors.countryRequired",
  "Country must be at least 2 characters": "validationErrors.countryMin",
  "Country must not exceed 100 characters": "validationErrors.countryMax",
  "Capacity must be at least 100": "validationErrors.capacityMin",
  "Capacity must not exceed 200,000": "validationErrors.capacityMax",
  "Capacity must be a valid number": "validationErrors.capacityInvalid",
  "Surface must be Natural Grass, Artificial Turf, or Hybrid":
    "validationErrors.surfaceInvalid",

  // Competition validation
  "Competition name is required": "validationErrors.competitionNameRequired",
  "Competition name must be at least 2 characters":
    "validationErrors.competitionNameMin",
  "Competition name must not exceed 100 characters":
    "validationErrors.competitionNameMax",
  "Competition ID must not exceed 40 characters":
    "validationErrors.competitionIdMax",
  "Competition ID must use letters, numbers, underscores, or hyphens":
    "validationErrors.competitionIdFormat",
  "Competition ID already exists": "validationErrors.competitionIdExists",
  "Localized name must not exceed 100 characters":
    "validationErrors.localizedNameMax",
};

/**
 * Translate a validation error message
 * If the message exists in the map, return the translation key
 * Otherwise, return the original message
 */
export function getTranslationKeyForError(errorMessage: string): string {
  return validationMessageMap[errorMessage] || errorMessage;
}
