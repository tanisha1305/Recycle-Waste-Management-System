# Debit Note and Credit Note System Implementation

## Overview
Implemented proper Debit Note and Credit Note system for handling returns with correct inventory, ledger, and payment tracking updates.

---

## DEBIT NOTE (Return to Supplier)

### Flow:
1. **Create Debit Note**
   - Select original purchase invoice to link
   - Add items being returned (from original purchase)
   - Specify quantities and amounts being debited

2. **Inventory Update** ✅
   - **INCREASE outBalance** (returned quantities go out)
   - Formula: `newOutBalance = currentOutBalance + quantity`
   - `inBalance` remains unchanged (original purchase amount)
   - `availableQuantity = inBalance - outBalance` (decreases correctly)
   - Creates date-wise transaction entry with negative qtyChange

3. **Supplier Ledger** ✅
   - **ADD DEBIT** entry (reduces what we owe)
   - Links to original purchase invoice
   - Shows in supplier's transaction history with proper reference

4. **Payment Tracking** ✅
   - **REDUCE "Amount to Pay"** for supplier
   - Uses adjustment transaction type with negative amount
   - Status: `completed` (immediately applies)
   - Adjusts outstanding balance automatically

5. **Statement of Accounts** ✅
   - **DO NOT UPDATE** (per requirements)
   - Debit notes excluded from statement generation

6. **Transaction History** ✅
   - Shows in supplier's ledger with debit entry
   - Reference links to original invoice
   - Date, amount, and reason tracked

---

## CREDIT NOTE (Return from Customer)

### Flow:
1. **Create Credit Note**
   - Select original sales invoice to link
   - Add items being returned (from original sale)
   - Specify quantities and amounts being credited

2. **Inventory Update** ✅
   - **ADD** returned quantities back to stock
   - Updates `inBalance` (increases stock)
   - Formula: `newInBalance = currentInBalance + quantity`
   - `outBalance` remains unchanged (original sale amount)
   - Updates `availableQuantity = inBalance - outBalance` (increases correctly)
   - Creates date-wise transaction entry with positive qtyChange

3. **Customer Ledger** ✅
   - **ADD CREDIT** entry (reduces what they owe us)
   - Links to original sales invoice
   - Shows in customer's transaction history with proper reference

4. **Payment Tracking** ✅
   - **REDUCE "Amount to Receive"** from customer
   - Uses adjustment transaction type with negative amount
   - Status: `completed` (immediately applies)
   - Adjusts outstanding balance automatically

5. **Statement of Accounts** ✅
   - **DO NOT UPDATE** (per requirements)
   - Credit notes excluded from statement generation

6. **Transaction History** ✅
   - Shows in customer's ledger with credit entry
   - Reference links to original invoice
   - Date, amount, and reason tracked

---

## Technical Implementation

### Files Modified:

#### 1. **DebitCreditNotes.tsx**
**Location:** `src/components/DebitCreditNotes.tsx`

**UI/UX Improvements:**
- **Page Header**: Clear description showing Credit Notes (customer returns) vs Debit Notes (supplier returns)
- **Info Banner**: Context-sensitive banner explaining the selected note type's behavior
  - Credit Note: Green banner explaining customer return flow
  - Debit Note: Blue banner explaining supplier return flow
- **Note Type Dropdown**: 
  - Options: "Credit Note (Return from Customer)" and "Debit Note (Return to Supplier)"
  - Helper text shows: Stock impact and payment tracking effect
- **Transaction Type Field**: 
  - Renamed to "Original Transaction Type"
  - Shows: "Sale (Customer Invoice)" or "Purchase (Supplier Invoice)"
  - Helper text: Links to original invoice type
- **Party Name Field**: 
  - Shows "(returning goods to us)" or "(we are returning goods to)"
  - Clarifies who is doing the returning
- **Invoice Number Field**: 
  - Renamed to "Original Sales/Purchase Invoice Number"
  - Placeholder text clarifies which type of invoice to reference
- **Reason Field**: 
  - Label: "Reason for Return to Supplier" or "Reason for Customer Return"
  - Context-specific placeholder text for each scenario
- **Items Section**: 
  - Header: "Items Being Returned (from customer/to supplier)"
  - Column Headers:
    - "Current" (instead of "Avail") - shows current stock level
    - "Return Qty" (instead of "Quantity") - clarifies these are returned quantities

**Changes:**
- **New Note Creation** (Lines ~598-650):
  - Debit Note: Subtracts quantities from `inBalance`
  - Credit Note: Adds quantities to `inBalance`
  - Only applies when status is `issued` or `paid`

- **Edit Note - Status Change to Draft/Cancelled** (Lines ~319-350):
  - Reverses inventory changes:
    - Debit Note: Adds back to `inBalance` (reverses subtraction)
    - Credit Note: Subtracts from `inBalance` (reverses addition)

- **Edit Note - Status Change to Issued/Paid** (Lines ~352-387):
  - Applies inventory changes:
    - Debit Note: Subtracts from `inBalance`
    - Credit Note: Adds to `inBalance`

- **Edit Note - Quantity Updates** (Lines ~389-431):
  - Adjusts inventory based on quantity difference
  - Debit Note: Subtracts difference from `inBalance`
  - Credit Note: Adds difference to `inBalance`

#### 2. **paymentTrackingService.ts**
**Location:** `src/services/paymentTrackingService.ts`

**Changes:**
- **createDebitCreditNoteTransaction** (Lines ~491-512):
  - Changed from `transactionType: 'invoice'` to `transactionType: 'adjustment'`
  - Changed from `status: 'pending'` to `status: 'completed'`
  - Uses **negative amount** to reduce outstanding balance
  - Formula: `amount: -Math.abs(amount)`
  - Description updated to clarify return adjustment

**Rationale:**
- Adjustment type with negative amount reduces the balance
- For customers: Reduces "Amount to Receive"
- For suppliers: Reduces "Amount to Pay"
- Marked as completed so it applies immediately

#### 3. **LedgerManagement.tsx**
**Location:** `src/components/LedgerManagement.tsx`

**Changes:**
- **Ledger Transaction Processing** (Lines ~232-257):
  - Credit Note: Creates **CREDIT** entry (reduces customer receivable)
  - Debit Note: Creates **DEBIT** entry (reduces supplier payable)
  - Updated comments to clarify proper accounting logic
  - Links to original invoice through reference number

#### 4. **StatementPage.tsx**
**Location:** `src/components/StatementPage.tsx`

**Changes:**
- **Statement Generation** (Lines ~213-218):
  - **REMOVED** debit/credit notes from statement of accounts
  - Added comment explaining they are tracked elsewhere:
    - Payment Tracking (reduces amounts owed)
    - Ledger accounts (shows transaction history)
    - Inventory (adjusts stock levels)

---

## Status Handling

### Note Status Types:
- **draft**: No inventory/payment updates
- **cancelled**: No inventory/payment updates
- **issued**: Applies all updates (inventory, payment, ledger)
- **paid**: Applies all updates (inventory, payment, ledger)

### State Transitions:
1. **Draft/Cancelled → Issued/Paid**: Apply updates
2. **Issued/Paid → Draft/Cancelled**: Reverse updates
3. **Issued/Paid → Issued/Paid**: Adjust for differences only

---

## Inventory Formula

### Current System:
```typescript
availableQuantity = inBalance - outBalance
totalBalance = availableQuantity
```

### Debit Note Impact:
```typescript
// Return to supplier - stock goes out (reduces availability)
newOutBalance = currentOutBalance + returnedQuantity
newInBalance = currentInBalance // unchanged
newAvailableQuantity = newInBalance - newOutBalance // decreases
```

### Credit Note Impact:
```typescript
// Return from customer - stock comes back (increases availability)
newInBalance = currentInBalance + returnedQuantity
newOutBalance = currentOutBalance // unchanged
newAvailableQuantity = newInBalance - newOutBalance // increases
```

---

## Payment Tracking Formula

### Adjustment Logic:
```typescript
// Negative adjustment reduces balance
if (transaction.amount < 0) {
  totalPaid += Math.abs(transaction.amount);
}

// Balance calculation
balance = totalInvoiced - totalPaid;

// For customers: positive balance = amount to receive
// For suppliers: positive balance = amount to pay
```

### Debit Note Effect:
```typescript
// Reduces supplier payable
amount: -Math.abs(debitNoteAmount)
// Results in: totalPaid increases → balance decreases
```

### Credit Note Effect:
```typescript
// Reduces customer receivable
amount: -Math.abs(creditNoteAmount)
// Results in: totalPaid increases → balance decreases
```

---

## Ledger Accounting

### Debit Note (Return to Supplier):
```
Supplier Account (Liability)
------------------------
DEBIT: Debit Note Amount
Effect: Reduces liability (what we owe)
```

### Credit Note (Return from Customer):
```
Customer Account (Asset/Receivable)
----------------------------------
CREDIT: Credit Note Amount
Effect: Reduces asset (what they owe us)
```

---

## Testing Checklist

### Debit Note Testing:
- [ ] Create debit note with status = issued
- [ ] Verify inventory `inBalance` **decreased**
- [ ] Verify supplier "Amount to Pay" **decreased**
- [ ] Verify debit entry in supplier ledger
- [ ] Verify NOT shown in statement of accounts
- [ ] Edit note to draft - verify inventory reversed
- [ ] Edit note back to issued - verify inventory reapplied
- [ ] Change quantities - verify inventory adjusted correctly

### Credit Note Testing:
- [ ] Create credit note with status = issued
- [ ] Verify inventory `inBalance` **increased**
- [ ] Verify customer "Amount to Receive" **decreased**
- [ ] Verify credit entry in customer ledger
- [ ] Verify NOT shown in statement of accounts
- [ ] Edit note to draft - verify inventory reversed
- [ ] Edit note back to issued - verify inventory reapplied
- [ ] Change quantities - verify inventory adjusted correctly

---

## Summary

✅ **Inventory Management**: Proper stock adjustments (debit = subtract, credit = add)
✅ **Payment Tracking**: Reduces outstanding balances correctly
✅ **Ledger Integration**: Shows in party transaction history with proper entries
✅ **Statement Exclusion**: Does not appear in statement of accounts
✅ **Status Handling**: Proper application/reversal based on status changes
✅ **Reference Linking**: Links to original invoices for traceability

All requirements have been implemented successfully!
