# Categories Not Loading - Firebase Rules Fix

## Problem
Custom categories like "SPARE", "MPESA CHARGES", "ELECTRICAL GOODS" are being saved to Firestore successfully, but they are NOT appearing in the dropdown list after page refresh.

**Console Evidence:**
- When adding "SPARE": Shows "Category already exists: SPARE" (proves it's in Firestore)
- But dropdown only shows 17 default categories
- Custom categories array is empty: `[]`

## Root Cause
The `categories` collection is missing from Firebase Security Rules, preventing the subscription from reading the data.

## Solution: Add Categories to Firebase Rules

### Step 1: Go to Firebase Console
1. Open https://console.firebase.google.com  
2. Select your project
3. Click on **Firestore Database** → **Rules** tab

### Step 2: Add Categories Rule

Add this rule to your Firestore Security Rules (after the existing rules):

```javascript
// Allow all authenticated users to read/write categories
match /categories/{categoryId} {
  allow read, write: if request.auth != null;
}
```

### Complete Updated Rules
Here's the complete rules file with the categories collection included:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Allow all authenticated users to read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null;
    }
    
    // Allow all authenticated users to read/write shipments
    match /shipments/{shipmentId} {
      allow read, write: if request.auth != null;
    }
    
    // Allow all authenticated users to read/write suppliers
    match /suppliers/{supplierId} {
      allow read, write: if request.auth != null;
    }
    
    // Allow all authenticated users to read/write customers
    match /customers/{customerId} {
      allow read, write: if request.auth != null;
    }
    
    // Allow all authenticated users to read/write inventory
    match /inventory/{itemId} {
      allow read, write: if request.auth != null;
    }
    
    // Allow all authenticated users to read/write direct purchases
    match /directPurchases/{purchaseId} {
      allow read, write: if request.auth != null;
    }
    
    // Allow all authenticated users to read/write transactions
    match /transactions/{transactionId} {
      allow read, write: if request.auth != null;
    }
    
    // Allow all authenticated users to read/write ledgers
    match /ledgers/{ledgerId} {
      allow read, write: if request.auth != null;
    }
    
    // Allow all authenticated users to read/write invoices
    match /invoices/{invoiceId} {
      allow read, write: if request.auth != null;
    }
    
    // Allow all authenticated users to read/write debit/credit notes
    match /debitCreditNotes/{noteId} {
      allow read, write: if request.auth != null;
    }
    
    // Allow all authenticated users to read/write delivery notes
    match /deliveryNotes/{noteId} {
      allow read, write: if request.auth != null;
    }
    
    // Allow all authenticated users to read/write bank accounts
    match /bankAccounts/{accountId} {
      allow read, write: if request.auth != null;
    }
    
    // Allow all authenticated users to read/write company details
    match /companyDetails/{docId} {
      allow read, write: if request.auth != null;
    }
    
    // *** NEW: Categories Collection ***
    // Allow all authenticated users to read/write categories
    match /categories/{categoryId} {
      allow read, write: if request.auth != null;
    }
    
    // Activity Logs Collection
    match /activityLogs/{logId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null;
      allow update, delete: if false;
    }
  }
}
```

### Step 3: Publish the Rules
1. Click the **Publish** button
2. Wait for confirmation

### Step 4: Test
1. Refresh your application page (Ctrl+F5)
2. Click "+ Add Entry" in Income & Expense
3. Check the Category dropdown
4. You should now see all custom categories like:
   - SPARE
   - MPESA CHARGES
   - ELECTRICAL GOODS
   - SPARE PARTS

## Verification

After updating the rules, check the browser console. You should see:
```
Setting up categories subscription for collection: categories
Categories snapshot received, document count: [more than 17]
Final categories array from subscription: (Array with all categories including custom ones)
```

## Why This Happened

When you added custom categories using the `addCategory` function, it used `addDoc` which requires write permission. This worked because Firebase allows writes in some contexts even without explicit rules.

However, the `subscribeToCategories` function uses `onSnapshot` which requires read permission. Without the explicit rule for the categories collection, the subscription was being blocked silently, only loading the 17 default categories that were initialized before the rules were enforced strictly.

## Important Note

Adding categories writes to Firestore successfully because `addDoc` can sometimes work even with restrictive rules. But reading via subscriptions (onSnapshot) requires explicit read permissions in Firebase Security Rules.
