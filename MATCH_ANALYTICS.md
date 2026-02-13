# Real-Time Match Analytics Dashboard

<!-- markdownlint-disable MD013 MD024 MD036 MD040 MD029 -->

## Overview

The **MatchAnalytics** component provides comprehensive real-time data visualization for logged match events. It transforms raw event data into beautiful, interactive charts that give instant insights into match dynamics, team performance, and player activity.

## Features

### 📊 **8 Different Visualizations**

#### 1. **Key Stats Cards** (4 metrics)

Gradient-colored stat cards with icons showing:

- **Total Events**: All logged events count
- **Events/Min**: Average event rate
- **Peak Minute**: Most active 5-minute interval
- **Possession Est.**: Ball possession approximation based on passes

#### 2. **Event Timeline** (Area Chart)

Shows event distribution over time in 5-minute intervals:

- **Home team** (green gradient)
- **Away team** (blue gradient)
- Animated gradients with smooth transitions
- Interactive tooltips showing event counts per interval

#### 3. **Event Type Distribution** (Pie Chart)

Colorful pie chart showing top 8 event types:

- Pass, Shot, Duel, FoulCommitted, Interception, etc.
- Percentage labels on each slice
- 10 vibrant colors rotating through types

#### 4. **Team Comparison Radar** (Radar Chart)

Pentagon comparison of key metrics:

- Passes
- Shots
- Duels
- Fouls
- Interceptions
- Semi-transparent fills for easy comparison

#### 5. **Most Active Players** (Horizontal Bar Chart)

Top 6 players by activity:

- **Purple bars**: Total events
- **Amber bars**: Passes
- **Pink bars**: Shots
- Player names on Y-axis

#### 6. **Activity by Metric** (Vertical Bar Chart)

Side-by-side comparison of both teams across all metrics:

- Home team (green)
- Away team (blue)
- Rounded bar corners for modern look

#### 7. **Match Summary Banner**

Gradient banner (purple to blue) with 4 key stats:

- Home team total events
- Away team total events
- Most common event type
- Most active player (MVP)

#### 8. **Empty State**

Friendly message when no data is available yet

## Data Analytics

### Calculated Metrics

#### **Timeline Analysis**

- Groups events into 5-minute intervals (0', 5', 10', etc.)
- Separates home vs away team activity
- Filters out empty intervals for cleaner visualization

#### **Event Type Distribution**

- Counts occurrences of each event type
- Sorts by frequency (most common first)
- Limits to top 8 types for readability

#### **Team Comparison**

Calculates per-team metrics:

- Pass count
- Shot count
- Duel count
- Foul count
- Interception count

#### **Player Activity**

Tracks per-player:

- Total events
- Passes
- Shots
- Uses short_name for display
- Shows top 6 most active players

#### **Possession Approximation**

Simple formula based on passes:

```
Possession% = (Team Passes / Total Passes) × 100
```

#### **Match Statistics**

- Total events logged
- Average events per minute
- Most active minute (highest event count in 5-min interval)
- Team-specific event counts

## Design

### Color Palette

- **Home Team**: Green (#10b981)
- **Away Team**: Blue (#3b82f6)
- **Primary**: Purple (#8b5cf6)
- **Secondary**: Amber (#f59e0b)
- **Accent**: Pink (#ec4899)
- **Event Colors**: 10-color array for variety

### UI Elements

- **White cards** with shadow for each chart section
- **Gradient headers** with Lucide icons
- **Responsive layouts**: Grid adapts to screen size
- **Interactive tooltips** on hover
- **Smooth animations**: Pulse effects, transitions

### Icons Used

- 🔥 TrendingUp (main title)
- ⚡ Activity (total events & timeline)
- 🎯 Target (event types)
- 👥 Users (top players)
- ⚡ Zap (event rate)
- 🛡️ Shield (team comparison)
- 🏆 Award (activity comparison)
- ⏰ Clock (peak minute)

## Integration

### Props Interface

```typescript
interface MatchAnalyticsProps {
  match: Match | null; // Match data with teams
  events: MatchEvent[]; // All logged events
  effectiveTime: number; // Match time in seconds
  t: any; // Translation function
}
```

### Usage in LoggerCockpit

Toggle between **Logger** and **Analytics** views:

```tsx
{viewMode === 'analytics' ? (
  <MatchAnalytics
    match={match}
    events={liveEvents}
    effectiveTime={effectiveTime}
    t={t}
  />
) : (
  // ... logger interface
)}
```

### View Toggle

Two-button toggle in header:

- **📋 Logger**: Main logging interface
- **📊 Analytics**: Real-time analytics dashboard

## Real-Time Updates

The component automatically updates as new events are logged:

1. New event logged → Added to `liveEvents` array
2. `useMemo` recalculates analytics when `events` changes
3. Charts re-render with updated data
4. Smooth animations on data changes

## Performance

### Optimization Techniques

- **useMemo** wraps all calculations
- Dependency array: `[match, events, effectiveTime, t]`
- Only recalculates when data actually changes
- Map/Set data structures for O(1) lookups
- Single pass through events for multiple metrics

### Chart Performance

- **ResponsiveContainer**: Auto-adjusts to parent width
- Fixed heights (300px) prevent layout shifts
- Recharts lazy loading and virtualization

## Translations

Supports i18n with translation keys:

```
analytics.title
analytics.totalEvents
analytics.eventRate
analytics.possession
analytics.eventTimeline
analytics.eventTypes
analytics.teamComparison
analytics.topPlayers
analytics.activityComparison
analytics.matchSummary
analytics.noData
... and more
```

## Dependencies

```json
{
  "recharts": "^2.x",
  "lucide-react": "^0.x"
}
```

## Future Enhancements

### Potential Additions

1. **Heat Map**: Field positioning of events
2. **Pass Network**: Player passing connections
3. **Timeline Events**: Goals/cards on timeline
4. **Shot Map**: Shot locations and outcomes
5. **Momentum Graph**: Rolling event rate over time
6. **Export**: Download charts as PNG/PDF
7. **Filters**: Filter by event type, player, time range
8. **Comparison**: Compare multiple matches
9. **Live Alerts**: Notifications for trends (e.g., "Home team dominating!")
10. **Expected Goals (xG)**: Shot quality analysis

### Technical Improvements

- Web Workers for heavy calculations
- Chart animations can be customized
- Add chart zoom/pan controls
- Real-time streaming with smooth transitions
- Dark mode color schemes

## Code Structure

```
MatchAnalytics.tsx
├── Interfaces
│   ├── EventTimeline
│   ├── EventTypeCount
│   ├── TeamComparison
│   └── PlayerActivity
├── Analytics Calculation (useMemo)
│   ├── Timeline mapping
│   ├── Event type distribution
│   ├── Team comparison
│   ├── Player activity
│   └── Derived stats
├── Render
│   ├── Empty State
│   ├── StatCard component
│   ├── Header
│   ├── Key Stats Grid
│   ├── Event Timeline Chart
│   ├── Two-Column Layout
│   │   ├── Event Type Pie
│   │   └── Team Radar
│   ├── Top Players Bar Chart
│   ├── Activity Comparison Bar Chart
│   └── Match Summary Banner
```

## Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support
- **Mobile**: Responsive charts adapt to touch

## Accessibility

- Semantic HTML structure
- ARIA labels on interactive elements
- Color contrast meets WCAG AA standards
- Keyboard navigation for chart interactions
- Screen reader friendly stat cards

## Examples

### Sample Data Insights

**Scenario 1: Dominant Home Team**

- Possession: 65% - 35%
- Event Timeline: Green bars tower over blue
- Most Active: Home midfielder with 45 events

**Scenario 2: Balanced Match**

- Possession: 52% - 48%
- Radar Chart: Pentagon nearly symmetrical
- Peak Minute: 30' with 18 total events

**Scenario 3: Late Game Surge**

- Timeline: Spike in 85'-90' interval
- Most Common: FoulCommitted (tactical fouls)
- Event Rate: 2.3 events/min (high intensity)

---

## Quick Start

1. **Install recharts**:

   ```bash
   npm install recharts
   ```

2. **Import component**:

   ```tsx
   import { MatchAnalytics } from "./logger/components/MatchAnalytics";
   ```

3. **Add to view**:

   ```tsx
   <MatchAnalytics
     match={match}
     events={liveEvents}
     effectiveTime={effectiveTime}
     t={t}
   />
   ```

4. **Toggle view** with button:

   ```tsx
   <button onClick={() => setViewMode("analytics")}>Show Analytics</button>
   ```

That's it! You now have beautiful real-time analytics for your match logging app! 🎉
