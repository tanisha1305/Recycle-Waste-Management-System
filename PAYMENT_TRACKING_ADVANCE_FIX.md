# Payment Tracking - Advance Payment & Invoice Status Fix

## Issues Identified and Fixed

### Problem Summary
The payment tracking system had multiple critical issues with advance payment handling and invoice status calculation:

1. **Advance Payment Display**: Advance payments were conditionally shown/hidden based on whether they were fully applied to invoices
2. **Invoice Status Incorrect**: Invoices showed as "PAID" even when there was still a remaining balance
3. **Invoice Selection Dropdown**: Invoices with remaining balances couldn't be selected for additional payments because status was incorrectly PAID
4. **Advance Payment Inconsistency**: Advance payment records would disappear and reappear inconsistently

### Root Cause Analysis

#### Issue 1: Conditional Advance Display
**Old Logic:**
```typescript
// Only show advance payments if totalRemainingAdvance > 0
if (totalRemainingAdvance > 0) {
  advancePayments.forEach(advPayment => {
    // Show advance...
  });
}
```

**Problem**: When advance payments were fully applied to invoices, they disappeared from the transaction history, causing confusion.

#### Issue 2: Invoice Status Calculation
**Old Logic:**
```typescript
if (remaining < 0.01) { 
  status = 'PAID';
} else if (totalPaidToInvoice > 0.01) {
  status = 'PARTIAL';
}
```

**Problem**: The `remaining` calculation was incorrect when advance payments were applied, causing invoices to show as PAID when they still had outstanding balances.

#### Issue 3: Invoice Dropdown Filter
**Old Logic:**
```typescript
.filter(consolidated => 
  consolidated.type === 'invoice' && 
  consolidated.status !== 'PAID'
)
```

**Problem**: Filtered by status instead of actual remaining amount, so invoices with incorrect PAID status couldn't be selected even when they had balances.

## Solutions Implemented

### Fix 1: Always Display Advance Payments Separately
**New Logic:**
```typescript
// CRITICAL FIX: ALWAYS show ALL advance payments as separate entries
// They should be visible regardless of whether they've been applied to invoices
advancePayments.forEach(advPayment => {
  consolidated.push({
    referenceNumber: advPayment.paymentReference || `ADVANCE-${advPayment.id.substring(0, 6)}`,
    date: advPayment.date,
    type: 'payment',
    description: advPayment.description || `Advance Payment`,
    totalAmount: advPayment.amount,
    amountPaidTillNow: advPayment.amount,
    amountRemaining: 0,
    status: 'PAID',
    transactions: [advPayment]
  });
});
```

**Result**: Advance payments are now ALWAYS visible in transaction history as separate entries, providing consistent visibility.

### Fix 2: Improved Advance Payment Detection
**New Logic:**
```typescript
// Separate advance payments (payments without invoice reference OR flagged as advance)
const advancePayments = payments.filter(p => !p.referenceNumber || p.isAdvancePayment);
const regularPayments = payments.filter(p => p.referenceNumber && !p.isAdvancePayment);
```

**Result**: Better detection of advance payments, including both explicitly flagged advances and unlinked payments.

### Fix 3: Corrected Status Calculation
**New Logic:**
```typescript
// Calculate remaining amount correctly
const remaining = invoiceAmount - totalPaidToInvoice;

// Determine status based on actual remaining amount
let status: 'UNPAID' | 'PARTIAL' | 'PAID' = 'UNPAID';
if (remaining <= 0.01) { // Less than or equal to 1 cent = fully paid
  status = 'PAID';
} else if (totalPaidToInvoice >= 0.01) { // Some payment = partial
  status = 'PARTIAL';
}
```

**Result**: Invoice status now correctly reflects the actual payment state based on precise remaining amount calculation.

### Fix 4: Invoice Dropdown Filter by Amount
**New Logic:**
```typescript
.filter(consolidated => 
  consolidated.type === 'invoice' && 
  consolidated.amountRemaining > 0.01 // Include invoices with remaining balance > 1 cent
)
```

**Result**: Invoices are now selectable based on actual remaining amount, not status, ensuring all unpaid/partially paid invoices can receive payments.

## Transaction Flow Example

### Scenario: Opening Balance + Advance + Invoice + Payments

**Initial State:**
- Opening Balance: KSh 2,000

**Transaction 1: Advance Payment**
- Customer pays KSh 3,000 advance
- System creates: `isAdvancePayment = true`, `referenceNumber = null`
- Display: Shows as separate "ADVANCE-xxxxx" entry
- Balance: -KSh 1,000 (1,000 advance credit)

**Transaction 2: Raise Invoice**
- Invoice INV-000001 for KSh 3,000
- System applies: Opening balance (2,000) + Advance (1,000) = 3,000 paid
- Display: 
  - Invoice INV-000001: Total 3,000, Paid 3,000, Remaining 0, Status: PAID
  - Advance payment still shows separately
- Balance: KSh 0

**Transaction 3: Payment for Invoice**
- Customer pays KSh 2,000 for the invoice
- Invoice dropdown shows: INV-000001 with remaining balance
- Payment links to invoice
- Display updates correctly

## Key Improvements

1. **Consistency**: Advance payments always visible, never disappear
2. **Accuracy**: Invoice status correctly calculated based on actual remaining amounts
3. **Transparency**: Clear separation between advance payments and invoice payments
4. **Usability**: Can always select invoices with remaining balances for additional payments

## Testing Recommendations

Test the following scenarios to verify the fix:

1. ✅ Create advance payment → Should show separately
2. ✅ Raise invoice after advance → Advance still visible separately
3. ✅ Make partial payment → Invoice status shows PARTIAL, selectable in dropdown
4. ✅ Complete payment → Invoice status shows PAID, not in dropdown
5. ✅ Multiple advances → All show separately
6. ✅ Advance + multiple invoices → Advance applies correctly, still visible
7. ✅ Payment without invoice → Creates advance, shows separately

## Files Modified

- `src/components/PaymentTracking.tsx`
  - Updated `consolidateTransactions()` function
  - Fixed invoice dropdown filters (both customer and supplier)
  - Improved advance payment handling logic

## Date: January 17, 2026
