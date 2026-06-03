# Payment Tracking System - Complete Guide

## Overview
The Payment Tracking system manages financial transactions with customers and suppliers, tracking invoices, payments, returns, and adjustments. It calculates outstanding balances and provides a clear view of who owes whom.

---

## Core Concepts

### Balance Calculation Formula
For both customers and suppliers:
```
Balance = Total Invoiced - Total Paid - Total Adjustments
```

- **Positive Balance**: Party owes you money (you need to receive/collect)
- **Negative Balance**: You owe the party money (you need to pay/refund)

---

## Customer Payment Tracking

### Transaction Types

#### 1. **Invoice** (Sale)
- **What it means**: Customer purchased goods from you
- **Effect**: Increases Total Invoiced → Increases balance
- **Example**: 
  - Invoice: KSh 5,000
  - Balance: +5,000 (Customer owes you)

#### 2. **Payment** (Customer pays you)
- **What it means**: Customer has paid you cash/bank transfer
- **Effect**: Increases Total Paid → Decreases balance
- **Example**:
  - Invoice: 5,000
  - Payment: 2,000
  - Balance: 3,000 (Customer still owes 3,000)

#### 3. **Credit Note** (Customer Returns)
- **What it means**: Customer returned goods to you
- **Effect**: Increases Adjustments → Decreases balance
- **Stored as**: Positive amount in adjustments
- **Example**:
  - Invoice: 5,000
  - Payment: 0
  - Credit Note: 1,000 (goods returned)
  - Balance: 5,000 - 0 - 1,000 = **4,000** (Customer now owes less)

#### 4. **Payback** (When balance is negative)
- **When**: Balance is negative (you owe customer money)
- **What it means**: You are paying back the customer for returned goods
- **Effect**: Creates negative adjustment → Reduces total adjustments
- **How it works**:
  - Initial: Invoice 3,000, Received 0, Returns 3,000 → Balance: -3,000 (You owe customer)
  - Add Payment (Payback): 1,000
  - New Adjustments: 3,000 - 1,000 = 2,000
  - New Balance: 3,000 - 0 - 2,000 = **1,000** (You now owe 1,000 instead of 3,000)
  - **Important**: Received amount stays at 0 (unchanged)

### Customer Balance Examples

#### Example 1: Normal Payment Flow
```
Invoice:      KSh 10,000
Received:     KSh 4,000
Returns:      KSh 0
Balance:      KSh 6,000 (Customer owes you)
```

#### Example 2: Customer Returns Goods (Credit Note)
```
Invoice:      KSh 10,000
Received:     KSh 4,000
Returns:      KSh 2,000 (Credit Note)
Balance:      KSh 4,000 (10,000 - 4,000 - 2,000)
```

#### Example 3: Over-payment or Full Return (Negative Balance)
```
Invoice:      KSh 3,000
Received:     KSh 1,500
Returns:      KSh 3,000 (Full credit note)
Balance:      KSh -1,500 (You owe customer 1,500)
Status:       "Return Payment to Customer" mode activates
```

#### Example 4: Paying Back Customer
```
Initial State:
  Invoice:    KSh 3,000
  Received:   KSh 1,500
  Returns:    KSh 3,000
  Balance:    KSh -1,500 (You owe customer)

After Payback of KSh 500:
  Invoice:    KSh 3,000
  Received:   KSh 1,500 (unchanged)
  Returns:    KSh 2,500 (reduced from 3,000)
  Balance:    KSh -1,000 (You now owe 1,000)
```

---

## Supplier Payment Tracking

### Transaction Types

#### 1. **Invoice** (Purchase)
- **What it means**: You purchased goods from supplier
- **Effect**: Increases Total Invoiced → Increases balance
- **Example**: 
  - Purchase Invoice: KSh 8,000
  - Balance: +8,000 (You owe supplier)

#### 2. **Payment** (You pay supplier)
- **What it means**: You have paid the supplier cash/bank transfer
- **Effect**: Increases Total Paid → Decreases balance
- **Example**:
  - Invoice: 8,000
  - Payment: 3,000
  - Balance: 5,000 (You still owe 5,000)

#### 3. **Debit Note** (You Return to Supplier)
- **What it means**: You returned goods to the supplier
- **Effect**: Increases Adjustments → Decreases balance
- **Stored as**: Positive amount in adjustments
- **Example**:
  - Invoice: 8,000
  - Payment: 0
  - Debit Note: 2,000 (goods returned)
  - Balance: 8,000 - 0 - 2,000 = **6,000** (You now owe less)

#### 4. **Payback** (When balance is negative)
- **When**: Balance is negative (supplier owes you money)
- **What it means**: Supplier is paying you back for returned goods
- **Effect**: Creates negative adjustment → Reduces total adjustments
- **How it works**:
  - Initial: Invoice 5,000, Paid 0, Returns 6,000 → Balance: -1,000 (Supplier owes you)
  - Receive Payment: 500 (supplier pays you back)
  - New Adjustments: 6,000 - 500 = 5,500
  - New Balance: 5,000 - 0 - 5,500 = **-500** (Supplier now owes you 500)
  - **Important**: Paid amount stays at 0 (unchanged)

### Supplier Balance Examples

#### Example 1: Normal Payment Flow
```
Invoice:      KSh 15,000
Paid:         KSh 7,000
Returns:      KSh 0
Balance:      KSh 8,000 (You owe supplier)
```

#### Example 2: You Return Goods (Debit Note)
```
Invoice:      KSh 15,000
Paid:         KSh 7,000
Returns:      KSh 3,000 (Debit Note)
Balance:      KSh 5,000 (15,000 - 7,000 - 3,000)
```

#### Example 3: Over-return (Negative Balance)
```
Invoice:      KSh 5,000
Paid:         KSh 1,000
Returns:      KSh 6,000 (Debit Notes)
Balance:      KSh -2,000 (Supplier owes you 2,000)
Status:       "Return Payment to Supplier" mode activates
```

#### Example 4: Supplier Paying You Back
```
Initial State:
  Invoice:    KSh 5,000
  Paid:       KSh 1,000
  Returns:    KSh 6,000
  Balance:    KSh -2,000 (Supplier owes you)

After Receiving Payment of KSh 800:
  Invoice:    KSh 5,000
  Paid:       KSh 1,000 (unchanged)
  Returns:    KSh 5,200 (reduced from 6,000)
  Balance:    KSh -1,200 (Supplier now owes 1,200)
```

---

## UI Behavior

### Normal State (Balance > 0)
**For Customers:**
- Button: "Add Payment"
- Modal Title: "Add Payment"
- Label: "Received Amount"
- Description: "Record payment for [Customer Name]"
- Effect: Increases "Received" amount

**For Suppliers:**
- Button: "Add Payment"
- Modal Title: "Add Payment"
- Label: "Payment Amount"
- Description: "Record payment for [Supplier Name]"
- Effect: Increases "Paid" amount

### Negative Balance State (Balance < 0)
**For Customers:**
- Button: "Add Payment" (same button)
- Modal Title: "Return Payment to Customer"
- Label: "Refund Amount"
- Description: "Paying back to [Customer Name] for returned goods or credit"
- Balance Display: "KSh -1,500 (You owe them)" in red
- Effect: Reduces "Returns/Adjustments", keeps "Received" unchanged

**For Suppliers:**
- Button: "Add Payment" (same button)
- Modal Title: "Receive Payment from Supplier"
- Label: "Received Amount"
- Description: "Receiving payment from [Supplier Name] for returned goods"
- Balance Display: "KSh -1,000 (They owe you)" in red
- Effect: Reduces "Returns/Adjustments", keeps "Paid" unchanged

---

## Key Business Rules

### Rule 1: Received/Paid Amounts Never Decrease
- ✅ **Correct**: Once a payment is received/made, that amount is permanent
- ❌ **Wrong**: Don't reduce received/paid amounts when handling returns

### Rule 2: Returns Reduce What's Owed
- **Credit Note** (customer returns): Reduces what customer owes
- **Debit Note** (you return to supplier): Reduces what you owe supplier
- Both are stored as **positive adjustments**

### Rule 3: Paybacks Reduce Adjustments
- When balance is negative, "Add Payment" creates a **negative adjustment**
- This reduces the total adjustments, bringing balance closer to zero
- Received/Paid amounts remain unchanged

### Rule 4: Same Logic for Both Parties
```
Customers:  Balance = Invoiced - Received - Returns
Suppliers:  Balance = Invoiced - Paid - Returns
```
The formula is identical; only the terminology changes.

---

## Transaction Flow Diagrams

### Customer Payment Flow
```
┌─────────────┐
│   Invoice   │ +5,000
│  Created    │────► Balance: +5,000 (Customer owes you)
└─────────────┘

┌─────────────┐
│   Payment   │ +2,000
│  Received   │────► Balance: +3,000 (Customer still owes)
└─────────────┘

┌─────────────┐
│ Credit Note │ +1,000 adjustment
│  (Return)   │────► Balance: +2,000 (Customer owes less)
└─────────────┘

┌─────────────┐
│   Another   │ +3,000 adjustment
│ Credit Note │────► Balance: -2,000 (YOU OWE CUSTOMER)
└─────────────┘

┌─────────────┐
│   Payback   │ -500 adjustment
│  to Customer│────► Balance: -1,500 (You owe less)
└─────────────┘
```

### Supplier Payment Flow
```
┌─────────────┐
│  Purchase   │ +8,000
│  Invoice    │────► Balance: +8,000 (You owe supplier)
└─────────────┘

┌─────────────┐
│   Payment   │ +3,000
│  Made       │────► Balance: +5,000 (You still owe)
└─────────────┘

┌─────────────┐
│ Debit Note  │ +2,000 adjustment
│  (Return)   │────► Balance: +3,000 (You owe less)
└─────────────┘

┌─────────────┐
│   Another   │ +4,000 adjustment
│ Debit Note  │────► Balance: -1,000 (SUPPLIER OWES YOU)
└─────────────┘

┌─────────────┐
│   Payment   │ -600 adjustment
│  Received   │────► Balance: -400 (Supplier owes less)
│from Supplier│
└─────────────┘
```

---

## Technical Implementation

### Data Structure
```typescript
PartyBalance {
  totalInvoiced: number;     // Sum of all invoices
  totalPaid: number;         // Sum of completed payments (never decreases)
  totalAdjustments: number;  // Sum of adjustments (can be positive or negative)
  balance: number;           // Calculated: invoiced - paid - adjustments
}
```

### Transaction Types
```typescript
Payment Transaction:
  - transactionType: 'payment'
  - amount: positive
  - effect: increases totalPaid, decreases balance

Adjustment (Credit/Debit Note):
  - transactionType: 'adjustment'
  - amount: positive
  - effect: increases totalAdjustments, decreases balance

Payback (Negative Balance):
  - transactionType: 'adjustment'
  - amount: negative
  - effect: decreases totalAdjustments, increases balance (makes less negative)
```

---

## Summary

✅ **The system correctly handles:**
- Normal payments (customer to you, you to supplier)
- Returns (credit notes for customers, debit notes for suppliers)
- Negative balances (when you owe them money)
- Paybacks (reducing what you owe without touching received/paid amounts)

✅ **Key principle:**
- Received/Paid amounts = **permanent record of cash flow**
- Adjustments = **flexible accounting for returns and paybacks**
- Balance = **current state of who owes whom**

This ensures accurate financial tracking for both customers and suppliers with proper handling of all edge cases.
