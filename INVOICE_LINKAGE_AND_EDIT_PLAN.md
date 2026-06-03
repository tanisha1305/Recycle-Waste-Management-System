# Invoice Linkage & Edit Implementation Plan

## 📊 CURRENT INVOICE LINKAGE ARCHITECTURE

### 1. **Invoice Creation Flow (When Status = 'issued')**

When an invoice is created or status changes from 'draft' to 'issued':

```
INVOICE CREATION (issued status)
    │
    ├─► INVENTORY UPDATE (outBalance)
    │   └─► Updates: outBalance, availableQuantity, totalBalance
    │       Formula: 
    │       - outBalance += item.quantity
    │       - availableQuantity = inBalance - outBalance
    │       - totalBalance = availableQuantity
    │
    ├─► PAYMENT TRACKING ENTRY (paymentTransactions collection)
    │   └─► Creates: Invoice transaction record
    │       - transactionType: 'invoice'
    │       - referenceNumber: systemInvoiceNumber
    │       - status: 'pending'
    │       - amount: totalAmount
    │       └─► UPDATE PARTY BALANCE
    │           - totalInvoiced += amount
    │           - balance = openingBalance + totalInvoiced - totalPaid - totalAdjustments
    │
    └─► ACCOUNTING TRANSACTION (transactions collection)
        └─► Creates: Income/Credit entry
            - type: 'credit'
            - category: 'Product Sales'
            - paymentMethod: 'On Credit'
            - contraType: 'invoice'
            - source: 'invoice'
            - ❌ NO BANK ACCOUNT LINKED (on credit)
```

### 2. **Payment Recording Flow**

When a payment is added against an invoice:

```
PAYMENT RECORDING
    │
    ├─► PAYMENT TRACKING ENTRY (paymentTransactions collection)
    │   └─► Creates: Payment transaction record
    │       - transactionType: 'payment'
    │       - referenceNumber: invoiceNumber (links to invoice)
    │       - status: 'completed'
    │       - amount: paymentAmount
    │       - bankAccountId: (if bank payment)
    │       └─► UPDATE PARTY BALANCE
    │           - totalPaid += amount
    │           - balance = openingBalance + totalInvoiced - totalPaid - totalAdjustments
    │
    └─► BANK/CASH BOOK ENTRY (transactions collection)
        └─► Creates: Contra entry
            - type: 'credit' (for customer payment received)
            - contraType: 'contra-entry'
            - bankAccountId: (if bank payment)
            - source: 'system'
            └─► ✅ UPDATE BANK ACCOUNT BALANCE
                - Bank account balance recalculated from all transactions
                - currentBalance = initialBalance + credits - debits - charges
```

### 3. **Invoice Deletion Flow**

When an invoice is deleted:

```
INVOICE DELETION
    │
    ├─► INVENTORY REVERSAL (if status was 'issued')
    │   └─► Updates: outBalance, availableQuantity, totalBalance
    │       Formula:
    │       - outBalance -= item.quantity
    │       - availableQuantity = inBalance - outBalance
    │       - totalBalance = availableQuantity
    │
    ├─► DELETE PAYMENT TRACKING
    │   └─► Deletes by referenceNumber (systemInvoiceNumber)
    │       - Deletes all payment transactions linked to invoice
    │       └─► UPDATE PARTY BALANCE (recalculates after deletion)
    │
    ├─► DELETE ACCOUNTING TRANSACTION
    │   └─► Deletes from transactions collection
    │       - Searches by description (contains systemInvoiceNumber)
    │       - Deletes invoice entry
    │       - ❌ DOES NOT DELETE PAYMENT ENTRIES!
    │
    └─► DELETE CREDIT NOTE (if exists)
        └─► Deletes from debitCreditNotes collection
            - Searches by originalInvoiceNumber
```

---

## 🔴 CURRENT ISSUES IDENTIFIED

### Issue 1: Payment Deletion Doesn't Remove Bank Entry ⚠️
**Problem**: When deleting a payment from `paymentTransactions`, the corresponding entry in `transactions` (bank/cash book) is NOT deleted.

**Impact**: 
- Bank balance shows incorrect amount (inflated by ghost payments)
- Transaction history shows payments that don't exist in payment tracking
- Data inconsistency between payment tracking and bank accounts

**Root Cause**: `deletePaymentTransaction()` in `paymentTrackingService.ts` only deletes from `paymentTransactions` collection, doesn't touch `transactions` collection.

### Issue 2: No Edit Capability for Invoices ⚠️
**Problem**: Cannot edit issued invoices, can only delete and recreate.

**Impact**:
- Inefficient workflow
- Loss of audit trail
- Cannot fix small mistakes
- Risk of data inconsistency during delete/recreate process

### Issue 3: Invoice Edit Would Break Multiple Linkages ⚠️
**Problem**: Editing an invoice affects multiple interconnected systems:
- Inventory levels
- Payment tracking balances
- Bank account balances
- Accounting transactions

**Impact**: Complex cascading updates required to maintain data integrity.

### Issue 4: No Remaining Balance Display on Payment ⚠️
**Problem**: When adding payment, user cannot see remaining balance clearly.

**Impact**: 
- Risk of overpayment entry
- Poor user experience
- Manual calculation required

---

## ✅ COMPREHENSIVE SOLUTION PLAN

### Phase 1: Fix Payment Deletion Issue (CRITICAL)

**Location**: `src/services/paymentTrackingService.ts`

**Changes Required**:

1. Update `deletePaymentTransaction()` function:
```typescript
export const deletePaymentTransaction = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, PAYMENT_TRANSACTIONS_COLLECTION, id);
    const transactionDoc = await getDoc(docRef);
    
    if (transactionDoc.exists()) {
      const transaction = convertTimestamps({ 
        id: transactionDoc.id, 
        ...transactionDoc.data() 
      }) as PaymentTransaction;
      
      // 1. Delete payment transaction
      await deleteDoc(docRef);
      
      // 2. Delete corresponding bank/cash book entry
      if (transaction.transactionType === 'payment' && 
          transaction.status === 'completed') {
        // Find and delete matching transaction in transactions collection
        const transactionsQuery = query(
          collection(db, 'transactions'),
          where('contraType', '==', 'contra-entry'),
          where('source', '==', 'system')
        );
        const transactionsSnapshot = await getDocs(transactionsQuery);
        
        for (const txnDoc of transactionsSnapshot.docs) {
          const txnData = txnDoc.data();
          // Match by date, amount, and party name
          if (txnData.date === transaction.date &&
              txnData.amount === transaction.amount &&
              (txnData.senderName === transaction.partyName || 
               txnData.receiverName === transaction.partyName)) {
            // Delete the transaction
            await deleteDoc(txnDoc.ref);
            console.log('✓ Deleted corresponding bank/cash entry');
            break;
          }
        }
      }
      
      // 3. Update party balance after deletion
      await updatePartyBalance(
        transaction.partyType, 
        transaction.partyId, 
        transaction.partyName, 
        transaction.partyCode
      );
    }
  } catch (error) {
    console.error('Error deleting payment transaction:', error);
    throw error;
  }
};
```

**Testing**:
- ✅ Delete a payment and verify bank balance updates
- ✅ Check transactions table to confirm entry removed
- ✅ Verify party balance recalculates correctly

---

### Phase 2: Implement Invoice Edit Functionality (HIGH PRIORITY)

#### 2.1 Edit Invoice Component UI

**Location**: `src/components/InvoiceManagement.tsx`

**Changes Required**:

1. Add Edit button to invoice list
2. Load invoice data into form
3. Distinguish between add/edit mode
4. Show "UPDATE" vs "SAVE" button

**Implementation**:
```typescript
// Already has editingInvoice state, enhance the edit flow:
const handleEdit = (invoice: Invoice) => {
  setEditingInvoice(invoice);
  // Populate form with invoice data
  setFormData({
    customerName: invoice.customerName,
    customerPRN: invoice.customerPRN,
    date: invoice.date,
    status: invoice.status,
    manualInvoiceNumber: invoice.manualInvoiceNumber,
    // ... other fields
  });
  setInvoiceItems(invoice.items);
  setShowAddForm(true);
};
```

#### 2.2 Invoice Edit Logic with Cascading Updates

**Critical Requirements**:

When editing an invoice, the system must:

1. **Calculate Differences**:
   - Old items vs New items
   - Old quantities vs New quantities
   - Old total amount vs New total amount
   - Old status vs New status

2. **Update Inventory** (if status = 'issued'):
   ```
   For each item:
     If new item → Add to outBalance
     If deleted item → Remove from outBalance
     If quantity changed → Adjust outBalance by difference
   ```

3. **Update Payment Tracking**:
   ```
   If invoice amount changed:
     - Update payment transaction amount
     - Recalculate party balance
   ```

4. **Update Accounting Transaction**:
   ```
   If status changed OR amount changed:
     - Update transaction amount
     - Update description if needed
   ```

5. **Maintain Payment History**:
   ```
   If invoice amount decreased below total paid:
     - Show warning
     - Require user confirmation
     - Option to create credit note for excess
   ```

**Implementation Steps**:

```typescript
const handleSaveInvoice = async () => {
  if (editingInvoice) {
    // EDIT MODE
    const oldInvoice = editingInvoice;
    const newInvoice = { /* new invoice data */ };
    
    // STEP 1: Validate changes
    const totalPaid = await getTotalPaidForInvoice(oldInvoice.systemInvoiceNumber);
    if (newInvoice.totalAmount < totalPaid) {
      const confirm = window.confirm(
        `Warning: New invoice amount (${newInvoice.totalAmount}) is less than ` +
        `total paid (${totalPaid}). This will create an overpayment. Continue?`
      );
      if (!confirm) return;
    }
    
    // STEP 2: Update inventory (if issued)
    if (oldInvoice.status === 'issued' && newInvoice.status === 'issued') {
      await updateInventoryForEdit(oldInvoice.items, newInvoice.items);
    }
    // Handle status changes
    else if (oldInvoice.status === 'draft' && newInvoice.status === 'issued') {
      await addInventoryForIssuedInvoice(newInvoice.items);
    }
    else if (oldInvoice.status === 'issued' && newInvoice.status === 'draft') {
      await reverseInventoryForIssuedInvoice(oldInvoice.items);
    }
    
    // STEP 3: Update payment tracking
    if (oldInvoice.totalAmount !== newInvoice.totalAmount || 
        oldInvoice.status !== newInvoice.status) {
      await updateInvoicePaymentTracking(
        oldInvoice.systemInvoiceNumber,
        newInvoice.totalAmount,
        newInvoice.status
      );
    }
    
    // STEP 4: Update accounting transaction
    if (oldInvoice.totalAmount !== newInvoice.totalAmount || 
        oldInvoice.status !== newInvoice.status) {
      await updateAccountingTransactionForInvoice(
        oldInvoice.systemInvoiceNumber,
        newInvoice.totalAmount,
        newInvoice.status
      );
    }
    
    // STEP 5: Update invoice in Firestore
    await updateInvoice(oldInvoice.id, newInvoice);
    
    alert('Invoice updated successfully!');
    setShowAddForm(false);
    setEditingInvoice(null);
  }
};
```

#### 2.3 Helper Functions to Create

**In `src/services/paymentTrackingService.ts`**:

```typescript
// Get total paid for an invoice
export const getTotalPaidForInvoice = async (
  invoiceNumber: string
): Promise<number> => {
  const q = query(
    collection(db, PAYMENT_TRANSACTIONS_COLLECTION),
    where('referenceNumber', '==', invoiceNumber),
    where('transactionType', '==', 'payment'),
    where('status', '==', 'completed')
  );
  const snapshot = await getDocs(q);
  
  let total = 0;
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    total += data.amount || 0;
  });
  
  return total;
};

// Update invoice amount in payment tracking
export const updateInvoicePaymentTracking = async (
  invoiceNumber: string,
  newAmount: number,
  newStatus: 'draft' | 'issued'
): Promise<void> => {
  if (newStatus === 'draft') {
    // Delete payment tracking for draft invoices
    await deletePaymentTrackingByReference(invoiceNumber);
    return;
  }
  
  // Find invoice transaction
  const q = query(
    collection(db, PAYMENT_TRANSACTIONS_COLLECTION),
    where('referenceNumber', '==', invoiceNumber),
    where('transactionType', '==', 'invoice')
  );
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    // No existing tracking, create new one if status is issued
    // (Should call createInvoiceTransaction)
    return;
  }
  
  // Update amount
  for (const docSnap of snapshot.docs) {
    const transaction = docSnap.data() as PaymentTransaction;
    await updatePaymentTransaction(docSnap.id, { amount: newAmount });
    
    // Recalculate party balance
    await updatePartyBalance(
      transaction.partyType,
      transaction.partyId,
      transaction.partyName,
      transaction.partyCode
    );
  }
};
```

**In `src/services/transactionService.ts`**:

```typescript
// Update accounting transaction for invoice
export const updateAccountingTransactionForInvoice = async (
  invoiceNumber: string,
  newAmount: number,
  newStatus: 'draft' | 'issued'
): Promise<void> => {
  // Find transaction by description
  const allTransactions = await getAllTransactions();
  const invoiceTransaction = allTransactions.find(
    t => t.source === 'invoice' && 
         t.description?.includes(invoiceNumber)
  );
  
  if (!invoiceTransaction) {
    // No transaction found
    if (newStatus === 'issued') {
      // Create new transaction
      // (Should call addTransaction)
    }
    return;
  }
  
  if (newStatus === 'draft') {
    // Delete transaction for draft invoices
    await deleteTransaction(invoiceTransaction.id);
  } else {
    // Update amount
    await updateTransaction(invoiceTransaction.id, {
      amount: newAmount
    });
  }
};
```

**In `src/services/inventoryService.ts`**:

```typescript
// Update inventory for edited invoice
export const updateInventoryForEdit = async (
  oldItems: InvoiceItem[],
  newItems: InvoiceItem[]
): Promise<void> => {
  // Create maps for comparison
  const oldItemsMap = new Map(
    oldItems.map(item => [item.itemCode.toUpperCase(), item.quantity])
  );
  const newItemsMap = new Map(
    newItems.map(item => [item.itemCode.toUpperCase(), item.quantity])
  );
  
  // Get all unique item codes
  const allItemCodes = new Set([
    ...oldItemsMap.keys(),
    ...newItemsMap.keys()
  ]);
  
  for (const itemCode of allItemCodes) {
    const oldQty = oldItemsMap.get(itemCode) || 0;
    const newQty = newItemsMap.get(itemCode) || 0;
    const difference = newQty - oldQty;
    
    if (difference !== 0) {
      // Find inventory item
      const inventoryItems = await getAllInventoryItems();
      const inventoryItem = inventoryItems.find(
        inv => inv.itemCode.toUpperCase() === itemCode
      );
      
      if (inventoryItem) {
        const currentOutBalance = inventoryItem.outBalance || 0;
        const newOutBalance = Math.max(0, currentOutBalance + difference);
        const newAvailableQuantity = 
          inventoryItem.inBalance - newOutBalance;
        const newTotalBalance = newAvailableQuantity;
        
        await updateInventoryItem(inventoryItem.id, {
          outBalance: newOutBalance,
          availableQuantity: newAvailableQuantity,
          totalBalance: newTotalBalance
        });
        
        console.log(
          `Updated ${itemCode}: outBalance ${currentOutBalance} → ` +
          `${newOutBalance} (diff: ${difference})`
        );
      }
    }
  }
};
```

---

### Phase 3: Add Remaining Balance Display (MEDIUM PRIORITY)

**Location**: `src/components/PaymentTracking.tsx`

**Changes Required**:

1. In the payment modal, show:
   - Invoice amount
   - Amount paid till now
   - **Remaining balance** (highlighted)
   - Amount being paid (input)
   - New remaining balance (calculated)

**Implementation**:

```typescript
// In handleOpenPaymentModal or when invoice is selected
const handleInvoiceSelection = async (invoiceId: string) => {
  setSelectedInvoiceId(invoiceId);
  
  // Find invoice transaction
  const invoice = partyTransactions.find(
    t => t.id === invoiceId && t.transactionType === 'invoice'
  );
  
  if (invoice) {
    // Calculate total paid
    const totalPaid = await getTotalPaidForInvoice(invoice.referenceNumber);
    const remaining = invoice.amount - totalPaid;
    
    setInvoiceDetails({
      invoiceNumber: invoice.referenceNumber,
      totalAmount: invoice.amount,
      amountPaid: totalPaid,
      amountRemaining: remaining
    });
  }
};

// In JSX, add display:
{invoiceDetails && (
  <div className="bg-blue-50 p-4 rounded-lg mb-4">
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div>Invoice: {invoiceDetails.invoiceNumber}</div>
      <div>Total: KSH {formatNumber(invoiceDetails.totalAmount)}</div>
      <div>Paid: KSH {formatNumber(invoiceDetails.amountPaid)}</div>
      <div className="font-bold text-red-600">
        Remaining: KSH {formatNumber(invoiceDetails.amountRemaining)}
      </div>
    </div>
  </div>
)}
```

---

### Phase 4: Extend Edit Functionality to Other Modules (LOW PRIORITY)

Apply the same edit pattern to:

1. **Direct Purchase** (`DirectPurchase.tsx`)
   - Edit purchase entries
   - Update inventory (inBalance)
   - Update payment tracking for suppliers
   - Update bank/cash transactions

2. **Delivery Notes** (`DeliveryNoteManagement.tsx`)
   - Edit delivery notes
   - Update inventory
   - Update related invoices if linked

3. **Debit/Credit Notes** (`DebitCreditNotes.tsx`)
   - Edit notes
   - Update adjustment amounts
   - Recalculate party balances

4. **Income/Expense Entries** (`IncomeExpense.tsx`)
   - Edit transaction entries
   - Update bank balances if bank account changed

---

## 📋 IMPLEMENTATION CHECKLIST

### Phase 1: Payment Deletion Fix
- [ ] Update `deletePaymentTransaction()` in `paymentTrackingService.ts`
- [ ] Add logic to find and delete matching bank/cash transaction
- [ ] Test payment deletion updates bank balance correctly
- [ ] Test payment deletion updates party balance correctly
- [ ] Test payment deletion with bank transfers
- [ ] Test payment deletion with cash payments

### Phase 2: Invoice Edit
- [ ] Create helper function `getTotalPaidForInvoice()`
- [ ] Create helper function `updateInvoicePaymentTracking()`
- [ ] Create helper function `updateAccountingTransactionForInvoice()`
- [ ] Create helper function `updateInventoryForEdit()`
- [ ] Add validation for invoice amount vs payments
- [ ] Update invoice edit logic in `InvoiceManagement.tsx`
- [ ] Add proper status change handling (draft ↔ issued)
- [ ] Test edit invoice with no payments
- [ ] Test edit invoice with partial payments
- [ ] Test edit invoice with full payment
- [ ] Test edit invoice quantity changes
- [ ] Test edit invoice status changes
- [ ] Test edit invoice amount changes

### Phase 3: Remaining Balance Display
- [ ] Add `invoiceDetails` state
- [ ] Create `handleInvoiceSelection()` function
- [ ] Add remaining balance UI in payment modal
- [ ] Show warning if payment exceeds remaining
- [ ] Auto-fill payment amount = remaining balance
- [ ] Test with various payment scenarios

### Phase 4: Extend to Other Modules  
- [ ] Implement edit for Direct Purchase
- [ ] Implement edit for Delivery Notes
- [ ] Implement edit for Debit/Credit Notes
- [ ] Implement edit for Income/Expense
- [ ] Create reusable edit patterns/hooks

---

## 🎯 PRIORITY ORDER

1. **CRITICAL (Do First)**: Phase 1 - Fix Payment Deletion
   - Affecting data integrity NOW
   - Bank balances incorrect
   - Quick fix, high impact

2. **HIGH**: Phase 2 - Invoice Edit
   - Most requested feature
   - Core business functionality
   - Complex but essential

3. **MEDIUM**: Phase 3 - Remaining Balance Display
   - Improves UX significantly
   - Prevents errors
   - Relatively simple to implement

4. **LOW**: Phase 4 - Extend Edit to Other Modules
   - Nice to have
   - Can be done incrementally
   - Build on Phase 2 learnings

---

## ⚠️ IMPORTANT CONSIDERATIONS

### Data Integrity Rules

1. **Never allow invoice amount < total payments**
   - Show warning
   - Require explicit confirmation
   - Consider creating automatic credit note

2. **Always maintain audit trail**
   - Log all edits with timestamp and user
   - Consider adding "editHistory" field to invoices
   - Track what changed (before/after)

3. **Atomic operations**
   - Use Firestore batch writes where possible
   - If one update fails, rollback all
   - Maintain transactional integrity

4. **Recalculate balances after every change**
   - Party balances
   - Bank account balances
   - Inventory balances

### User Experience

1. **Clear warnings for destructive changes**
   - Changing status from issued to draft
   - Reducing invoice amount below paid amount
   - Deleting items that have been paid for

2. **Prevent accidental edits**
   - Confirm dialogs for major changes
   - Show summary of changes before saving
   - Option to cancel/undo

3. **Show what will be affected**
   - "This will update inventory"
   - "This will recalculate customer balance"
   - "This will update bank balance"

---

## 🔒 SECURITY & PERMISSIONS

Consider adding:

1. **Role-based edit permissions**
   - Admin: Can edit anything
   - Manager: Can edit within date range
   - User: Cannot edit issued invoices

2. **Edit time limits**
   - Can only edit within 7/30 days of creation
   - Older records require admin approval

3. **Edit history tracking**
   - Who edited
   - When edited
   - What changed
   - Why (optional notes field)

---

## 📊 TESTING STRATEGY

### Unit Tests
- Test individual helper functions
- Test calculation logic
- Test validation rules

### Integration Tests
- Test full edit flow from UI to database
- Test cascading updates across collections
- Test error handling and rollback

### User Acceptance Tests
- Edit invoice with no payments
- Edit invoice with partial payments
- Edit invoice with full payments
- Edit invoice quantity up/down
- Edit invoice status draft ↔ issued
- Delete payment and verify all updates
- Add payment and verify all updates

---

## 🚀 DEPLOYMENT PLAN

1. **Development Phase**
   - Implement Phase 1 in dev environment
   - Test thoroughly
   - Code review

2. **Beta Testing**
   - Deploy to staging/test environment
   - Test with real-like data
   - Get user feedback

3. **Production Rollout**
   - Deploy Phase 1 (critical fix)
   - Monitor for issues
   - Deploy Phase 2 after stabilization
   - Deploy Phase 3
   - Deploy Phase 4 incrementally

---

## 📞 SUPPORT & MAINTENANCE

After implementation:

1. **Monitor for issues**
   - Bank balance discrepancies
   - Inventory inconsistencies
   - Payment tracking errors

2. **User training**
   - Document new edit functionality
   - Create video tutorials
   - Provide quick reference guide

3. **Continuous improvement**
   - Gather user feedback
   - Track most common edit scenarios
   - Optimize for performance

---

## Summary

This comprehensive plan addresses:
✅ Current invoice linkage architecture
✅ Identified issues and their impact
✅ Detailed solution for each phase
✅ Implementation checklist
✅ Testing strategy
✅ Deployment plan

The phased approach ensures critical fixes are deployed first while building toward full edit functionality across the entire system.
