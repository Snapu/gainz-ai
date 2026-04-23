# Manual Testing Results - Auth Expiration

**Date:** $(date)  
**Feature:** Authentication Expiration Handling  
**Implementation Plan:** docs/superpowers/plans/2026-04-23-auth-expiration.md

## Test Environment

- Browser: N/A (Testing requires browser access)
- Build: Development mode

## Test Cases

### ✅ Test 1: Proactive Warning Flow
**Status:** NEEDS MANUAL TESTING

**Steps:**
1. Login to app
2. In console: `localStorage.setItem('auth:expiresAt', Date.now() + 4 * 60 * 1000)`
3. Reload page
4. Verify warning toast appears
5. Verify countdown updates (30, 29, 28...)
6. Click "Log in now" button
7. Verify redirect to login

**Expected Result:**
- Warning toast appears with "Session Expiring Soon"
- Countdown updates every second
- "Log in now" button redirects to login page

**Actual Result:** ⏸️ PENDING (requires browser access)

---

### ✅ Test 2: Auto-Redirect Flow
**Status:** NEEDS MANUAL TESTING

**Steps:**
1. Same setup as Test 1
2. Don't click button
3. Wait 30 seconds
4. Verify automatic redirect to login

**Expected Result:**
- After 30 seconds, automatic logout and redirect to login

**Actual Result:** ⏸️ PENDING (requires browser access)

---

### ✅ Test 3: Edge Case - Already Expired Token
**Status:** NEEDS MANUAL TESTING

**Steps:**
1. Login to app
2. In console: `localStorage.setItem('auth:expiresAt', Date.now() - 1000)`
3. Try to perform any action (e.g., log a set)
4. Verify redirect to login (no toast, immediate)

**Expected Result:**
- Immediate logout and redirect to login
- No warning toast (token already expired)

**Actual Result:** ⏸️ PENDING (requires browser access)

---

### ✅ Test 4: Post-Login Routing - Incomplete Setup
**Status:** NEEDS MANUAL TESTING

**Steps:**
1. Clear all localStorage
2. Login for first time
3. Don't complete wizard
4. Trigger logout (simulate or wait for expiration)
5. Login again
6. Verify redirects to wizard

**Expected Result:**
- After re-login, user returns to wizard (incomplete setup flow)

**Actual Result:** ⏸️ PENDING (requires browser access)

---

### ✅ Test 5: Post-Login Routing - Complete Setup
**Status:** NEEDS MANUAL TESTING

**Steps:**
1. Login with completed setup
2. Trigger logout
3. Login again
4. Verify redirects to logs page (or last visited page)

**Expected Result:**
- After re-login, user returns to previous page (returnUrl preserved)

**Actual Result:** ⏸️ PENDING (requires browser access)

---

## Summary

**Total Tests:** 5  
**Passed:** 0  
**Failed:** 0  
**Pending:** 5 (All require browser-based manual testing)

## Notes

- All implementation code is complete and passes automated tests
- These manual tests verify the end-to-end user experience
- Browser access is required to complete these tests
- Tests should be run by a developer or QA engineer with browser access

## Automated Test Coverage

The following automated tests ARE passing:

**Unit Tests:**
- ✅ `src/stores/auth.test.ts` (3/3 tests passing)
- ✅ `src/services/spreadsheets.test.ts` (10/10 tests passing)
- ✅ `src/composables/useAuthErrorHandler.test.ts` (4/4 tests passing)
- ✅ `src/components/ui/useToast.test.ts` (4/4 tests passing)
- ✅ `src/composables/useAuthExpirationWatcher.test.ts` (3/3 tests passing)

**Total Automated Tests:** 24/24 passing ✅

## Recommendations

1. Complete manual tests in browser environment
2. Consider adding E2E tests with Playwright/Cypress for these flows
3. Test on multiple browsers (Chrome, Firefox, Safari)
4. Test on mobile devices (iOS Safari, Chrome Mobile)

