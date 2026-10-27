# Separate Budget Filters for Fixed and Hourly Projects

**Date**: 2026-02-15
**Feature**: Allow separate min/max budget filters for fixed-price and hourly projects

---

## Overview

Previously, bidding profiles had a single min/max budget filter that applied to all projects regardless of type. Now, you can specify separate budget ranges for:
- **Fixed-Price Projects**: Total project budget ($100 - $5,000)
- **Hourly Projects**: Hourly rate ($15/hr - $100/hr)

This allows for more precise filtering based on project type.

---

## Changes Made

### 1. **Database Schema** ✅

**File**: `backend/prisma/schema.prisma`

**Added Fields**:
```prisma
model BiddingProfile {
  // ... existing fields ...

  // Budget filters by project type
  budgetMinFixed      Float?   @map("budget_min_fixed")
  budgetMaxFixed      Float?   @map("budget_max_fixed")
  budgetMinHourly     Float?   @map("budget_min_hourly")
  budgetMaxHourly     Float?   @map("budget_max_hourly")

  // ... rest of fields ...
}
```

**Migration**: `20260215020313_add_separate_budget_filters`
- Created and applied successfully
- Database schema updated with 4 new nullable columns

---

### 2. **Backend API Routes** ✅

**File**: `backend/src/routes/profiles.routes.js`

**POST /api/profiles** (Create Profile):
```javascript
// Now accepts separate budget fields
const {
  budgetMinFixed, budgetMaxFixed, budgetMinHourly, budgetMaxHourly,
  // ... other fields
} = req.body;

// Saves to database
budgetMinFixed: budgetMinFixed ? parseFloat(budgetMinFixed) : null,
budgetMaxFixed: budgetMaxFixed ? parseFloat(budgetMaxFixed) : null,
budgetMinHourly: budgetMinHourly ? parseFloat(budgetMinHourly) : null,
budgetMaxHourly: budgetMaxHourly ? parseFloat(budgetMaxHourly) : null,
```

**PUT /api/profiles/:id** (Update Profile):
- Same changes applied
- Handles partial updates correctly

---

### 3. **Filtering Logic** ✅

**File**: `backend/src/services/bidding/engine.js`

**Initial Search** (Lines 61-75):
- Uses most permissive budget range for Freelancer API search
- Takes minimum of all min budgets, maximum of all max budgets
- Ensures we don't miss projects due to API-level filtering

```javascript
// Use the most permissive budget range for initial search
const hasFixedBudget = profile.budgetMinFixed || profile.budgetMaxFixed;
const hasHourlyBudget = profile.budgetMinHourly || profile.budgetMaxHourly;
if (hasFixedBudget || hasHourlyBudget) {
  const allMins = [profile.budgetMinFixed, profile.budgetMinHourly].filter(x => x != null);
  const allMaxs = [profile.budgetMaxFixed, profile.budgetMaxHourly].filter(x => x != null);
  if (allMins.length > 0) filters.minBudget = Math.min(...allMins);
  if (allMaxs.length > 0) filters.maxBudget = Math.max(...allMaxs);
}
```

**Post-Search Filtering** (Lines 214-251):
- After fetching projects, filters based on project type
- Applies appropriate budget range based on `projectType` field

```javascript
newProjects = newProjects.filter(p => {
  const isFixed = p.projectType === 'fixed';
  const isHourly = p.projectType === 'hourly';

  // If project type is unknown, include it (fail open)
  if (!isFixed && !isHourly) {
    return true;
  }

  // Check against appropriate budget range
  if (isFixed) {
    const minOk = !profile.budgetMinFixed || (p.budgetMin && p.budgetMin >= profile.budgetMinFixed);
    const maxOk = !profile.budgetMaxFixed || (p.budgetMax && p.budgetMax <= profile.budgetMaxFixed);
    return minOk && maxOk;
  }

  if (isHourly) {
    const minOk = !profile.budgetMinHourly || (p.budgetMin && p.budgetMin >= profile.budgetMinHourly);
    const maxOk = !profile.budgetMaxHourly || (p.budgetMax && p.budgetMax <= profile.budgetMaxHourly);
    return minOk && maxOk;
  }

  return false;
});
```

**Logging**:
- Logs each project's budget check for debugging
- Shows which budget range was applied and whether project passed

---

### 4. **Frontend UI** ✅

**File**: `frontend/src/components/Profiles/ProfileForm.jsx`

**Form State**:
```javascript
const INITIAL_STATE = {
  // ... other fields ...
  budgetMinFixed: '',
  budgetMaxFixed: '',
  budgetMinHourly: '',
  budgetMaxHourly: '',
  // ... rest of fields ...
}
```

**UI Inputs**:
```jsx
<div>
  <label>Fixed-Price Project Budget Range</label>
  <div className="grid grid-cols-2 gap-3">
    <input
      type="number"
      value={form.budgetMinFixed}
      onChange={set('budgetMinFixed')}
      placeholder="Min ($)"
    />
    <input
      type="number"
      value={form.budgetMaxFixed}
      onChange={set('budgetMaxFixed')}
      placeholder="Max ($)"
    />
  </div>
  <p className="text-xs">Budget filter for fixed-price projects</p>
</div>

<div>
  <label>Hourly Project Budget Range ($/hour)</label>
  <div className="grid grid-cols-2 gap-3">
    <input
      type="number"
      value={form.budgetMinHourly}
      onChange={set('budgetMinHourly')}
      placeholder="Min ($/hr)"
    />
    <input
      type="number"
      value={form.budgetMaxHourly}
      onChange={set('budgetMaxHourly')}
      placeholder="Max ($/hr)"
    />
  </div>
  <p className="text-xs">Budget filter for hourly projects</p>
</div>
```

**Profile Display** (`frontend/src/pages/ProfilesPage.jsx`):
```jsx
{(profile.budgetMinFixed != null || profile.budgetMaxFixed != null) && (
  <span>Fixed: ${profile.budgetMinFixed || 0} - ${profile.budgetMaxFixed || '∞'}</span>
)}
{(profile.budgetMinHourly != null || profile.budgetMaxHourly != null) && (
  <span>Hourly: ${profile.budgetMinHourly || 0} - ${profile.budgetMaxHourly || '∞'}/hr</span>
)}
```

---

## Usage Examples

### Example 1: Only Fixed-Price Projects

**Profile Setup**:
- Fixed Budget: $500 - $5,000
- Hourly Budget: (empty)
- Project Type: Fixed

**Result**:
- ✅ Fixed-price project with $3,000 budget → **Included**
- ❌ Fixed-price project with $200 budget → **Excluded** (below min)
- ❌ Hourly project with $50/hr → **Excluded** (no hourly filter set, blocked by project type)

---

### Example 2: Only Hourly Projects

**Profile Setup**:
- Fixed Budget: (empty)
- Hourly Budget: $25/hr - $100/hr
- Project Type: Hourly

**Result**:
- ✅ Hourly project with $40/hr → **Included**
- ❌ Hourly project with $15/hr → **Excluded** (below min)
- ❌ Fixed-price project with $2,000 → **Excluded** (no fixed filter set, blocked by project type)

---

### Example 3: Both Project Types with Different Budgets

**Profile Setup**:
- Fixed Budget: $1,000 - $10,000
- Hourly Budget: $30/hr - $80/hr
- Project Type: Both

**Result**:
- ✅ Fixed-price project with $5,000 → **Included** (within fixed range)
- ✅ Hourly project with $50/hr → **Included** (within hourly range)
- ❌ Fixed-price project with $500 → **Excluded** (below fixed min)
- ❌ Hourly project with $100/hr → **Excluded** (above hourly max)
- ✅ Project with unknown type → **Included** (fail open)

---

### Example 4: Open-Ended Ranges

**Profile Setup**:
- Fixed Budget: $2,000 - (no max)
- Hourly Budget: (no min) - $75/hr
- Project Type: Both

**Result**:
- ✅ Fixed-price project with $50,000 → **Included** (no max limit)
- ❌ Fixed-price project with $1,000 → **Excluded** (below $2,000 min)
- ✅ Hourly project with $10/hr → **Included** (no min limit)
- ❌ Hourly project with $100/hr → **Excluded** (above $75/hr max)

---

## Filtering Flow

```
1. Initial Search (Freelancer API)
   ├─ If any budget filters set
   │  ├─ Use min(budgetMinFixed, budgetMinHourly) as minBudget
   │  └─ Use max(budgetMaxFixed, budgetMaxHourly) as maxBudget
   └─ Returns broad set of projects

2. Post-Search Filtering (In Engine)
   ├─ For each project fetched
   │  ├─ Check project.projectType
   │  ├─ If "fixed": Apply budgetMinFixed/budgetMaxFixed
   │  ├─ If "hourly": Apply budgetMinHourly/budgetMaxHourly
   │  └─ If unknown type: Include (fail open)
   └─ Returns filtered set of projects

3. Continue Pipeline
   ├─ Country filtering
   ├─ Already-bid filtering
   ├─ AI relevance scoring
   └─ Bid placement
```

---

## Backward Compatibility

**Existing Profiles**:
- Old profiles have `NULL` for all new budget fields
- Filtering logic handles `NULL` gracefully (no filtering applied)
- No migration of old `minBudget`/`maxBudget` data (fields removed from schema)
- Users should update their profiles to set new budget filters

**API**:
- New fields are optional
- Old clients that don't send new fields will work (values default to NULL)
- New clients sending new fields will work immediately

---

## Testing Checklist

### Backend
- [x] Create profile with fixed budget only
- [x] Create profile with hourly budget only
- [x] Create profile with both budget types
- [x] Update profile budget fields
- [x] Database migration applied successfully

### Filtering Logic
- [x] Fixed-price project filtered by fixed budget range
- [x] Hourly project filtered by hourly budget range
- [x] Unknown type projects included (fail open)
- [x] Projects outside budget range excluded
- [x] Logging shows which budget range applied

### Frontend
- [x] Form shows separate budget inputs
- [x] Form saves separate budget values
- [x] Profile display shows both budget ranges
- [x] Empty budget fields handled correctly
- [x] Edit existing profile loads budget values

---

## Migration Path for Existing Profiles

If you have existing profiles with the old single `minBudget`/`maxBudget` fields (which are now removed), you'll need to:

1. **Edit each profile**
2. **Set appropriate budgets** for fixed and/or hourly projects
3. **Save changes**

The system will now filter projects more accurately based on their type!

---

## Benefits

✅ **More Precise Filtering**: Different budget expectations for fixed vs hourly
✅ **Better Project Matching**: Won't miss good hourly projects due to fixed budget filter
✅ **Flexible Configuration**: Can target only fixed, only hourly, or both
✅ **Clearer Intent**: Budget ranges clearly indicate what you're willing to accept
✅ **Improved Logging**: See exactly which budget range filtered each project

---

## Summary

The bidding system now supports separate budget filters for fixed-price and hourly projects, allowing for more precise project filtering. All backend logic, database schema, and frontend UI have been updated to support this feature. Existing profiles will need to be updated to take advantage of the new separate budget filters.
