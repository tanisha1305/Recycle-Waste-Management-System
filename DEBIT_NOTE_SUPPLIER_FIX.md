# Debit Note Supplier Invoice Linking - Fix Applied

## Issue Description
Debit notes for suppliers were not being properly linked to their corresponding purchase invoices in the Payment Tracking system. This caused:
- Debit notes to appear as separate transactions instead of being grouped with their invoices
- Invoice status to remain "PARTIAL" even when debit notes fully settled the remaining balance
- Inability to see debit note details in the invoice dropdown

**Example**: Invoice `oE3aSGG202Gb2C7xvKyI` with KSh 20,000 total, KSh 19,000 paid, and a debit note `DN-P-0001` for KSh 1,000 should show status as "PAID" but was showing as "PARTIAL".

## Root Cause
The system was using **shipment document IDs** (Firebase auto-generated IDs) instead of **purchase invoice numbers** when creating payment tracking transactions for shipments. This meant:
- When a shipment was created, the payment tracking `referenceNumber` was set to the shipment ID (e.g., "abc123xyz")
- When a debit note was created against the invoice (e.g., "D001"), it stored "D001" as the `referenceNumber`
- Since "abc123xyz" ≠ "D001", the debit note couldn't link to the invoice

## Changes Made

### 1. Updated `createShipmentTransaction` Function
**File**: `src/services/paymentTrackingService.ts`

**Before**:
```typescript
export const createShipmentTransaction = async (
  // ... other params
  shipmentId: string, // ❌ Was using shipment ID
  // ...
) => {
  return await addPaymentTransaction({
    // ...
    referenceNumber: shipmentId, // ❌ This was the problem
    description: `Shipment ${shipmentId} - Amount payable to ${partyName}`,
    // ...
  });
};
```

**After**:
```typescript
export const createShipmentTransaction = async (
  // ... other params
  purchaseInvoiceNumber: string, // ✅ Now uses actual invoice number
  // ...
) => {
  return await addPaymentTransaction({
    // ...
    referenceNumber: purchaseInvoiceNumber, // ✅ Fixed
    description: `Purchase Invoice ${purchaseInvoiceNumber} - Amount payable to ${partyName}`,
    // ...
  });
};
```

### 2. Updated ReceiverPanel
**File**: `src/components/ReceiverPanel.tsx`

**Before**:
```typescript
if (user && shipmentId && s.supplier) {
  await createShipmentTransaction(
    // ...
    shipmentId, // ❌ Passing shipment ID
    // ...
  );
}
```

**After**:
```typescript
if (user && shipmentId && s.supplier && s.purchaseInvoiceNumber) {
  await createShipmentTransaction(
    // ...
    s.purchaseInvoiceNumber, // ✅ Passing invoice number
    // ...
  );
}
```

### 3. Updated SenderPanel
**File**: `src/components/SenderPanel.tsx`

Similar changes made to ensure shipments created in SenderPanel also use invoice numbers.

## How It Works Now

### For Customers (Credit Notes) - Already Working ✅
1. Customer Invoice created → `referenceNumber` = `systemInvoiceNumber` (e.g., "INV-001")
2. Credit Note created for return → `referenceNumber` = same invoice number ("INV-001")
3. Payment Tracking consolidates both under the invoice → Shows as linked ✅

### For Suppliers (Debit Notes) - Now Fixed ✅
1. Purchase Invoice/Shipment created → `referenceNumber` = `purchaseInvoiceNumber` (e.g., "D001")
2. Debit Note created for return → `referenceNumber` = same invoice number ("D001")
3. Payment Tracking consolidates both under the invoice → Shows as linked ✅

## What Users Need to Do

### For Existing Data (Already Created Shipments/Invoices)
The fix only applies to **new shipments** created after this update. For existing data where the linking is broken:

**Option 1: Re-create the Debit Note** (Recommended if not many)
1. Delete the existing debit note
2. Create a new debit note with the correct invoice number
3. The new debit note will automatically link correctly

**Option 2: Manual Data Fix** (For advanced users with many records)
You would need to update the `referenceNumber` field in the `paymentTransactions` collection in Firestore to match invoice numbers instead of shipment IDs.

### For New Data (Going Forward)
✅ **No action needed** - The system will now automatically:
1. Use invoice numbers when creating shipment payment tracking
2. Link debit notes to invoices correctly
3. Show proper invoice status (PAID when fully settled)
4. Display debit notes in the invoice dropdown

## Verification Steps

To verify the fix is working:

1. **Create a new shipment** with a purchase invoice number (e.g., "D002")
2. **Check Payment Tracking** → Should see invoice "D002" listed
3. **Create a debit note** for that invoice
4. **Check Payment Tracking** again → Debit note should appear **under** the invoice (expandable)
5. **Check Invoice Status** → Should update to "PAID" if debit note + payments = total amount

## Technical Details

### Payment Transaction Structure
```typescript
{
  transactionType: 'invoice' | 'payment' | 'adjustment',
  referenceType: 'invoice' | 'direct-payment' | 'credit-note' | 'debit-note',
  referenceNumber: string, // This MUST match to link transactions
  // ...
}
```

### Consolidation Logic (Already Correct)
The `consolidateTransactions` function in `PaymentTracking.tsx` was already working correctly:
```typescript
// Find all payments and adjustments for this invoice
const relatedPayments = payments.filter(p => p.referenceNumber === invoiceRef);
const relatedAdjustments = adjustments.filter(a => a.referenceNumber === invoiceRef);
```

The issue was that `invoiceRef` and debit note's `referenceNumber` didn't match due to using shipment IDs.

## Benefits of This Fix

✅ **Accurate Payment Status** - Invoices show correct status when settled by debit notes
✅ **Better Visibility** - Debit notes appear under their invoices (not as separate items)
✅ **Cleaner Reports** - Statement PDFs show properly grouped transactions
✅ **Consistent Behavior** - Suppliers work the same way as customers
✅ **Future-Proof** - All new transactions will link correctly

## Additional Notes

- **Direct Purchases** were already using invoice numbers correctly ✅
- **Customer Invoices** were already using system invoice numbers correctly ✅
- Only **Shipment-based purchases** had the issue (now fixed) ✅

## Support

If you encounter issues with existing data or need help with the migration, please:
1. Check that the invoice number field is filled when creating shipments
2. Ensure debit notes reference the exact same invoice number
3. Contact support if you need help fixing historical data

---

**Date Applied**: December 25, 2025
**Files Modified**: 
- `src/services/paymentTrackingService.ts`
- `src/components/ReceiverPanel.tsx`
- `src/components/SenderPanel.tsx`
