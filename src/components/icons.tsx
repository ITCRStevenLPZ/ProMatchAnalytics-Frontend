/**
 * Centralized Font Awesome icon components.
 *
 * Each export mirrors the old lucide-react component name so that consumers
 * only need to change their import path:
 *
 *   - import { Play } from "lucide-react";
 *   + import { Play } from "../components/icons";
 *
 * Every component accepts `size?: number` and `className?: string` to stay
 * API-compatible with lucide-react usage patterns.
 */
import React from "react";
import {
  FontAwesomeIcon,
  FontAwesomeIconProps,
} from "@fortawesome/react-fontawesome";
import {
  faPlay,
  faPause,
  faPlus,
  faPen,
  faTrash,
  faMagnifyingGlass,
  faXmark,
  faFilter,
  faCheck,
  faChevronDown,
  faChevronUp,
  faChevronLeft,
  faChevronRight,
  faAnglesLeft,
  faAnglesRight,
  faArrowDown,
  faArrowLeft,
  faArrowRight,
  faArrowRightArrowLeft,
  faArrowsLeftRight,
  faArrowTrendUp,
  faArrowTurnUp,
  faArrowUp,
  faArrowsUpDown,
  faAward,
  faBars,
  faBolt,
  faBullseye,
  faCalendar,
  faChartColumn,
  faCircleCheck,
  faCircleExclamation,
  faCircleInfo,
  faCircleXmark,
  faClock,
  faClockRotateLeft,
  faCopy,
  faCreditCard,
  faCrosshairs,
  faDownload,
  faEnvelope,
  faExternalLink,
  faEye,
  faFileLines,
  faFlag,
  faGears,
  faHeartPulse,
  faHome,
  faLanguage,
  faList,
  faLock,
  faLockOpen,
  faMap,
  faMapPin,
  faMugHot,
  faRefresh,
  faRightFromBracket,
  faRotateLeft,
  faShield,
  faShieldHalved,
  faShuffle,
  faSpinner,
  faTableCellsLarge,
  faTriangleExclamation,
  faTrophy,
  faTv,
  faUpload,
  faUser,
  faUserCheck,
  faUserCog,
  faUserPlus,
  faUsers,
  faUserXmark,
  faWifi,
} from "@fortawesome/free-solid-svg-icons";
import { faCircleCheck as faCircleCheckRegular } from "@fortawesome/free-regular-svg-icons";

/* ------------------------------------------------------------------ */
/*  Helper – wraps FontAwesomeIcon preserving the lucide-react API    */
/* ------------------------------------------------------------------ */

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  onClick?: React.MouseEventHandler;
  "data-testid"?: string;
}

function icon(
  faIcon: FontAwesomeIconProps["icon"],
  displayName: string,
): React.FC<IconProps> {
  const Comp: React.FC<IconProps> = ({
    size,
    className,
    style,
    title,
    onClick,
    "data-testid": testId,
  }) => (
    <FontAwesomeIcon
      icon={faIcon}
      className={className}
      style={{ fontSize: size ? `${size}px` : undefined, ...style }}
      title={title}
      onClick={onClick}
      data-testid={testId}
    />
  );
  Comp.displayName = displayName;
  return Comp;
}

/* ------------------------------------------------------------------ */
/*  Exported icon components (alphabetical, matching lucide names)     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Type alias for backwards compatibility with lucide-react typings   */
/* ------------------------------------------------------------------ */

export type LucideIcon = React.FC<IconProps>;

/* ------------------------------------------------------------------ */
/*  Exported icon components (alphabetical, matching lucide names)     */
/* ------------------------------------------------------------------ */

export const Activity = icon(faHeartPulse, "Activity");
export const AlertCircle = icon(faCircleExclamation, "AlertCircle");
export const AlertTriangle = icon(faTriangleExclamation, "AlertTriangle");
export const ArrowDown = icon(faArrowDown, "ArrowDown");
export const ArrowLeft = icon(faArrowLeft, "ArrowLeft");
export const ArrowLeftRight = icon(faArrowsLeftRight, "ArrowLeftRight");
export const ArrowRight = icon(faArrowRight, "ArrowRight");
export const ArrowRightLeft = icon(faArrowRightArrowLeft, "ArrowRightLeft");
export const ArrowUp = icon(faArrowUp, "ArrowUp");
export const ArrowUpDown = icon(faArrowsUpDown, "ArrowUpDown");
export const Award = icon(faAward, "Award");
export const BarChart3 = icon(faChartColumn, "BarChart3");
export const Calendar = icon(faCalendar, "Calendar");
export const Check = icon(faCheck, "Check");
export const CheckCircle = icon(faCircleCheck, "CheckCircle");
export const CheckCircle2 = icon(faCircleCheckRegular, "CheckCircle2");
export const ChevronDown = icon(faChevronDown, "ChevronDown");
export const ChevronLeft = icon(faChevronLeft, "ChevronLeft");
export const ChevronRight = icon(faChevronRight, "ChevronRight");
export const ChevronsLeft = icon(faAnglesLeft, "ChevronsLeft");
export const ChevronsRight = icon(faAnglesRight, "ChevronsRight");
export const ChevronUp = icon(faChevronUp, "ChevronUp");
export const Clock = icon(faClock, "Clock");
export const Coffee = icon(faMugHot, "Coffee");
export const Copy = icon(faCopy, "Copy");
export const CornerUpLeft = icon(faArrowTurnUp, "CornerUpLeft");
export const CreditCard = icon(faCreditCard, "CreditCard");
export const Crosshair = icon(faCrosshairs, "Crosshair");
export const Download = icon(faDownload, "Download");
export const Edit = icon(faPen, "Edit");
export const Edit3 = icon(faPen, "Edit3");
export const ExternalLink = icon(faExternalLink, "ExternalLink");
export const Eye = icon(faEye, "Eye");
export const FileText = icon(faFileLines, "FileText");
export const Filter = icon(faFilter, "Filter");
export const Flag = icon(faFlag, "Flag");
export const History = icon(faClockRotateLeft, "History");
export const Home = icon(faHome, "Home");
export const Info = icon(faCircleInfo, "Info");
export const Languages = icon(faLanguage, "Languages");
export const LayoutGrid = icon(faTableCellsLarge, "LayoutGrid");
export const List = icon(faList, "List");
export const Loader2 = icon(faSpinner, "Loader2");
export const Lock = icon(faLock, "Lock");
export const LogOut = icon(faRightFromBracket, "LogOut");
export const Mail = icon(faEnvelope, "Mail");
// biome-ignore lint: Map is the lucide name
export const MapIcon = icon(faMap, "Map");
export const MapPin = icon(faMapPin, "MapPin");
export const Menu = icon(faBars, "Menu");
export const Pause = icon(faPause, "Pause");
export const Play = icon(faPlay, "Play");
export const Plus = icon(faPlus, "Plus");
export const RefreshCw = icon(faRefresh, "RefreshCw");
export const RotateCcw = icon(faRotateLeft, "RotateCcw");
export const Search = icon(faMagnifyingGlass, "Search");
export const Settings = icon(faGears, "Settings");
export const Shield = icon(faShield, "Shield");
export const ShieldAlert = icon(faShieldHalved, "ShieldAlert");
export const Shuffle = icon(faShuffle, "Shuffle");
export const Target = icon(faBullseye, "Target");
export const Trash2 = icon(faTrash, "Trash2");
export const TrendingUp = icon(faArrowTrendUp, "TrendingUp");
export const Trophy = icon(faTrophy, "Trophy");
export const Tv = icon(faTv, "Tv");
export const Undo2 = icon(faRotateLeft, "Undo2");
export const Unlock = icon(faLockOpen, "Unlock");
export const Upload = icon(faUpload, "Upload");
export const User = icon(faUser, "User");
export const UserCheck = icon(faUserCheck, "UserCheck");
export const UserCog = icon(faUserCog, "UserCog");
export const UserPlus = icon(faUserPlus, "UserPlus");
export const Users = icon(faUsers, "Users");
export const UserX = icon(faUserXmark, "UserX");
export const Wifi = icon(faWifi, "Wifi");
export const WifiOff = icon(faWifi, "WifiOff"); // same glyph, strikethrough via CSS
export const X = icon(faXmark, "X");
export const XCircle = icon(faCircleXmark, "XCircle");
export const Zap = icon(faBolt, "Zap");
