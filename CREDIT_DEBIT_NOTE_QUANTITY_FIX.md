# Credit/Debit Note Quantity Validation Fix

## Problem Statement

Previously, the system allowed users to create multiple credit/debit notes against the same invoice without tracking cumulative quantities. This meant:

**Example Scenario:**
- Invoice created for 10 units
- Credit note 1: Customer returns 5 units ✓
- Credit note 2: Customer returns 7 units ✓ (SHOULD BE BLOCKED!)
- Total returned: 12 units (exceeds invoice of 10 units) ❌

The system was allowing returns/notes that exceeded the original invoiced quantity.

## Solution Implemented

### 1. Cumulative Quantity Tracking Function

Added `getCumulativeQuantityForItem()` function that:
- Sums up all existing credit/debit note quantities for a specific invoice and item
- Excludes the current note being edited (to allow updates)
- Only counts issued/paid notes (draft/cancelled notes don't count)

```typescript
const getCumulativeQuantityForItem = (invoiceNumber: string, itemCode: string, currentNoteId?: string): number => {
  // Filters and sums quantities from all related notes on the same invoice
  // excluding the current note being edited
}
```

### 2. Real-time Validation

Added validation in `handleItemChange()` when quantity is modified:
- Calculates cumulative quantity from existing notes
- Checks if new quantity + existing quantities exceed original invoice quantity
- Shows helpful error message with:
  - Already returned quantity
  - Remaining available quantity
  - Original invoice total

### 3. Submit-time Validation

Added pre-submission validation in `handleSubmit()`:
- Prevents saving if any item exceeds invoice quantities
- Shows alert with all quantity errors
- Only validates when status is 'issued' or 'paid' (drafts can have any quantity)

### 4. User Interface Updates

#### Quantity Input Styling
- Quantity input fields turn red when exceeding invoice quantity
- Border color changes to indicate error state

#### Error Messages
- Real-time error messages below each item row
- Shows: "Cannot exceed invoice quantity. Already returned: X, Remaining: Y, Invoice total: Z"
- Warning banner appears above submit button when errors exist

#### Submit Button
- Disabled when quantity validation errors exist
- Cannot accidentally save invalid quantities

### 5. State Management

Added new state variable:
```typescript
const [quantityErrors, setQuantityErrors] = useState<{[key: number]: string}>({});
```

Errors are cleared when:
- Form is reset
- Invoice selection changes
- Quantity is corrected to valid value

## Validation Logic

The validation ensures:

```
For each item:
  cumulative_quantity = sum(all existing notes for this invoice + item)
  new_total = cumulative_quantity + current_quantity
  
  if new_total > original_invoice_quantity:
    ❌ BLOCK and show error
  else:
    ✅ ALLOW
```

## Example Flow

### Scenario 1: Valid Credit Notes
1. Invoice: 10 units of Item A
2. Credit Note 1: 5 units → ✅ Allowed (5 ≤ 10)
3. Credit Note 2: 3 units → ✅ Allowed (5 + 3 = 8 ≤ 10)
4. Credit Note 3: 2 units → ✅ Allowed (8 + 2 = 10 ≤ 10)
5. Credit Note 4: 1 unit → ❌ Blocked (10 + 1 = 11 > 10)

### Scenario 2: Editing Existing Note
1. Invoice: 10 units
2. Existing Credit Note 1: 5 units
3. Edit Credit Note 1 to 8 units → ✅ Allowed (8 ≤ 10)
4. Edit Credit Note 1 to 11 units → ❌ Blocked (11 > 10)

### Scenario 3: Draft Notes
1. Invoice: 10 units
2. Draft Credit Note: 20 units → ✅ Allowed (draft status)
3. Change status to 'issued' with 20 units → ❌ Blocked (validation applies)

## Files Modified

- `src/components/DebitCreditNotes.tsx`
  - Added `quantityErrors` state
  - Added `getCumulativeQuantityForItem()` function
  - Updated `handleItemChange()` with validation
  - Updated `handleSubmit()` with pre-save validation
  - Updated UI to display errors
  - Updated submit button to disable on errors
  - Clear errors on form reset and invoice change

## Benefits

1. **Data Integrity**: Prevents returning/noting more than invoiced
2. **Real-time Feedback**: Users see errors as they type
3. **Clear Messages**: Detailed error messages explain what's wrong
4. **Prevents Mistakes**: Can't submit invalid quantities
5. **Edit Support**: Properly handles editing existing notes
6. **Draft Flexibility**: Drafts can have any quantity for planning

## Testing Recommendations

1. Create invoice with multiple items
2. Create first credit note with partial quantities
3. Try to create second credit note exceeding remaining quantities
4. Verify error messages show correct calculations
5. Test editing existing notes
6. Test with draft status (should allow any quantity)
7. Test changing draft to issued (should validate)
8. Test with multiple items on same invoice
