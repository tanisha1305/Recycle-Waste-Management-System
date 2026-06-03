import { collection, getDocs, deleteDoc, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';

// List of all collections in the database
const COLLECTIONS = [
  'users',
  'shipments',
  'inventory',
  'suppliers',
  'customers',
  'invoices',
  'debitCreditNotes',
  'transactions',
  'bankAccounts',
  'directPurchases',
  'ledgerEntries',
  'deliveryNotes',
  'companyDetails',
  'incomeExpense',
  'paymentTransactions',
  'partyBalances'
];

/**
 * Remove all old demo users (admin001, manager001, operator001)
 * Keeps only the new admin user (nitin@gmail.com)
 */
export const cleanupOldDemoUsers = async (): Promise<void> => {
  try {
    console.log('Cleaning up old demo users...');
    
    const OLD_DEMO_USER_IDS = ['admin001', 'manager001', 'operator001'];
    const usersRef = collection(db, 'users');
    
    // Get all users with old demo login IDs
    const q = query(usersRef, where('loginId', 'in', OLD_DEMO_USER_IDS));
    const querySnapshot = await getDocs(q);
    
    console.log(`Found ${querySnapshot.size} old demo users to remove`);
    
    // Delete all old demo users
    const deletePromises = querySnapshot.docs.map(docSnapshot => 
      deleteDoc(doc(db, 'users', docSnapshot.id))
    );
    
    await Promise.all(deletePromises);
    
    console.log('Old demo users cleaned up successfully!');
  } catch (error) {
    console.error('Error cleaning up old demo users:', error);
    throw error;
  }
};

/**
 * Clear all data from the database
 * This will delete all documents from all collections
 * Admin user (nitin@gmail.com) is preserved
 */
export const clearDatabase = async (): Promise<void> => {
  try {
    console.log('Starting database clear...');
    
    const ADMIN_USER_ID = 'nitin@gmail.com';
    
    for (const collectionName of COLLECTIONS) {
      const collectionRef = collection(db, collectionName);
      const snapshot = await getDocs(collectionRef);
      
      console.log(`Clearing ${collectionName}: ${snapshot.size} documents`);
      
      // For users collection, preserve admin user
      const deletePromises = snapshot.docs
        .filter(document => {
          if (collectionName === 'users') {
            const userData = document.data();
            return userData.loginId !== ADMIN_USER_ID;
          }
          return true;
        })
        .map(document => deleteDoc(doc(db, collectionName, document.id)));
      
      await Promise.all(deletePromises);
    }
    
    console.log('Database cleared successfully (admin user preserved)');
  } catch (error) {
    console.error('Error clearing database:', error);
    throw error;
  }
};

/**
 * Add mock data to the database
 * This will populate the database with sample data for testing
 */
export const addMockData = async (): Promise<void> => {
  try {
    console.log('Starting to add mock data...');
    
    // First, ensure admin user exists
    const { seedMockUsers } = await import('./authService');
    await seedMockUsers();
    console.log('Admin user verified/created');
    
    // Import mock data functions from various services
    const { addSupplier } = await import('./supplierService');
    const { addCustomer } = await import('./customerService');
    const { addInventoryItem } = await import('./inventoryService');
    const { addShipment } = await import('./shipmentService');
    const { addDirectPurchase } = await import('./directPurchaseService');
    const { addBankAccount } = await import('./bankAccountService');
    const { updateCompanyDetails } = await import('./companyService');
    
    // Add sample company details
    await updateCompanyDetails({
      companyName: 'Sample Recycling Company',
      companyPIN: 'P000000000A',
      address: '123 Main Street, City',
      mobile: '+1234567890',
      email: 'contact@samplerecycling.com'
    });
    console.log('Added company details');
    
    // Add sample suppliers
    const suppliers = [
      {
        id: crypto.randomUUID(),
        supplierCode: 'SUP-001',
        companyName: 'EcoWaste Solutions',
        address: '456 Supplier Lane, Industrial Park',
        contactNumber: '+1234567890',
        email: 'contact@ecowaste.com',
        pin: 'P111111111A',
        vatNo: 'VAT111111111',
        createdAt: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        supplierCode: 'SUP-002',
        companyName: 'Green Materials Ltd',
        address: '789 Supply Road, Business District',
        contactNumber: '+1234567891',
        email: 'contact@greenmaterials.com',
        pin: 'P222222222B',
        vatNo: 'VAT222222222',
        createdAt: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        supplierCode: 'SUP-003',
        companyName: 'RecyclePro Inc',
        address: '321 Commerce Ave, City Center',
        contactNumber: '+1234567892',
        email: 'contact@recyclepro.com',
        pin: 'P333333333C',
        vatNo: 'VAT333333333',
        createdAt: new Date().toISOString()
      }
    ];
    
    for (const supplier of suppliers) {
      await addSupplier(supplier);
    }
    console.log('Added suppliers');
    
    // Add sample customers
    const customers = [
      {
        id: crypto.randomUUID(),
        customerCode: 'CUS-001',
        companyName: 'ABC Manufacturing',
        address: '100 Factory Street, Industrial Zone',
        contactNumber: '+1234567893',
        email: 'contact@abcmfg.com',
        pin: 'P444444444D',
        vatNo: 'VAT444444444',
        createdAt: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        customerCode: 'CUS-002',
        companyName: 'XYZ Industries',
        address: '200 Production Blvd, Tech Park',
        contactNumber: '+1234567894',
        email: 'contact@xyzind.com',
        pin: 'P555555555E',
        vatNo: 'VAT555555555',
        createdAt: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        customerCode: 'CUS-003',
        companyName: 'Global Traders Co',
        address: '300 Trade Center, Downtown',
        contactNumber: '+1234567895',
        email: 'contact@globaltraders.com',
        pin: 'P666666666F',
        vatNo: 'VAT666666666',
        createdAt: new Date().toISOString()
      }
    ];
    
    for (const customer of customers) {
      await addCustomer(customer);
    }
    console.log('Added customers');
    
    // Add sample bank accounts
    const bankAccounts = [
      {
        id: crypto.randomUUID(),
        accountName: 'Main Business Account',
        accountNumber: '1234567890',
        initialBalance: 100000,
        currentBalance: 100000
      },
      {
        id: crypto.randomUUID(),
        accountName: 'Petty Cash Account',
        accountNumber: '0987654321',
        initialBalance: 25000,
        currentBalance: 25000
      }
    ];
    
    for (const account of bankAccounts) {
      await addBankAccount(account);
    }
    console.log('Added bank accounts');
    
    // Add sample inventory items
    const inventoryItems = [
      {
        itemCode: 'PLA-001',
        itemName: 'PET Plastic',
        itemDescription: 'Recycled PET plastic bottles',
        openingBalance: 1000,
        availableQuantity: 1000,
        inBalance: 0,
        outBalance: 0,
        totalBalance: 1000,
        unit: 'KG',
        shipmentDate: new Date().toISOString().split('T')[0]
      },
      {
        itemCode: 'MET-001',
        itemName: 'Aluminum Scrap',
        itemDescription: 'Mixed aluminum scrap',
        openingBalance: 500,
        availableQuantity: 500,
        inBalance: 0,
        outBalance: 0,
        totalBalance: 500,
        unit: 'KG',
        shipmentDate: new Date().toISOString().split('T')[0]
      },
      {
        itemCode: 'PAP-001',
        itemName: 'Cardboard',
        itemDescription: 'Recycled cardboard sheets',
        openingBalance: 750,
        availableQuantity: 750,
        inBalance: 0,
        outBalance: 0,
        totalBalance: 750,
        unit: 'KG',
        shipmentDate: new Date().toISOString().split('T')[0]
      },
      {
        itemCode: 'PLA-002',
        itemName: 'HDPE Plastic',
        itemDescription: 'High-density polyethylene',
        openingBalance: 800,
        availableQuantity: 800,
        inBalance: 0,
        outBalance: 0,
        totalBalance: 800,
        unit: 'KG',
        shipmentDate: new Date().toISOString().split('T')[0]
      },
      {
        itemCode: 'MET-002',
        itemName: 'Steel Scrap',
        itemDescription: 'Mixed steel scrap',
        openingBalance: 1200,
        availableQuantity: 1200,
        inBalance: 0,
        outBalance: 0,
        totalBalance: 1200,
        unit: 'KG',
        shipmentDate: new Date().toISOString().split('T')[0]
      }
    ];
    
    for (const item of inventoryItems) {
      await addInventoryItem(item);
    }
    console.log('Added inventory items');
    
    // Add sample shipments
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    const shipments = [
      {
        id: crypto.randomUUID(),
        date: today.toISOString().split('T')[0],
        supplierCode: suppliers[0].supplierCode,
        supplier: suppliers[0].companyName,
        purchaseInvoiceNumber: 'INV-001',
        purchaseKg: 500,
        ratePerKg: 45,
        totalCost: 22500,
        sentKg: 500,
        receiver: 'Warehouse A',
        status: 'sent' as const
      },
      {
        id: crypto.randomUUID(),
        date: yesterday.toISOString().split('T')[0],
        supplierCode: suppliers[1].supplierCode,
        supplier: suppliers[1].companyName,
        purchaseInvoiceNumber: 'INV-002',
        purchaseKg: 300,
        ratePerKg: 60,
        totalCost: 18000,
        sentKg: 300,
        receiver: 'Warehouse B',
        status: 'received' as const,
        receivedKg: 295,
        transportLoss: 5,
        transportLossPercent: 1.67,
        transportLossMoney: 300
      },
      {
        id: crypto.randomUUID(),
        date: twoDaysAgo.toISOString().split('T')[0],
        supplierCode: suppliers[2].supplierCode,
        supplier: suppliers[2].companyName,
        purchaseInvoiceNumber: 'INV-003',
        purchaseKg: 400,
        ratePerKg: 50,
        totalCost: 20000,
        sentKg: 400,
        receiver: 'Warehouse C',
        status: 'completed' as const,
        receivedKg: 400,
        transportLoss: 0,
        transportLossPercent: 0,
        transportLossMoney: 0
      }
    ];
    
    for (const shipment of shipments) {
      await addShipment(shipment);
    }
    console.log('Added shipments');
    
    // Add sample direct purchases
    const directPurchases = [
      {
        supplierCode: suppliers[0].supplierCode,
        supplierName: suppliers[0].companyName,
        purchaseDate: today.toISOString().split('T')[0],
        invoiceNumber: 'PINV-001',
        items: [
          {
            itemCode: 'PLA-001',
            itemName: 'PET Plastic',
            quantity: 200,
            unit: 'KG',
            rate: 45,
            taxRate: 0,
            amountExclTax: 9000,
            taxAmount: 0,
            totalAmount: 9000
          }
        ],
        totalAmount: 9000
      },
      {
        supplierCode: suppliers[1].supplierCode,
        supplierName: suppliers[1].companyName,
        purchaseDate: yesterday.toISOString().split('T')[0],
        invoiceNumber: 'PINV-002',
        items: [
          {
            itemCode: 'MET-002',
            itemName: 'Steel Scrap',
            quantity: 150,
            unit: 'KG',
            rate: 60,
            taxRate: 0,
            amountExclTax: 9000,
            taxAmount: 0,
            totalAmount: 9000
          }
        ],
        totalAmount: 9000
      }
    ];
    
    for (const purchase of directPurchases) {
      await addDirectPurchase(purchase);
    }
    console.log('Added direct purchases');
    
    console.log('Mock data added successfully');
  } catch (error) {
    console.error('Error adding mock data:', error);
    throw error;
  }
};

/**
 * Migration: Fix existing inventory items to add opening balance to inBalance
 * This ensures opening quantities appear in month-wise and date-wise views
 */
export const migrateInventoryOpeningBalance = async (): Promise<void> => {
  try {
    console.log('Starting inventory opening balance migration...');
    
    const inventoryRef = collection(db, 'inventory');
    const snapshot = await getDocs(inventoryRef);
    
    let updatedCount = 0;
    
    for (const document of snapshot.docs) {
      const data = document.data();
      const openingBalance = Number(data.openingBalance) || 0;
      const currentInBalance = Number(data.inBalance) || 0;
      const outBalance = Number(data.outBalance) || 0;
      
      // Only update if item has opening balance and inBalance is 0
      // This means the opening balance was never added to inBalance
      if (openingBalance > 0 && currentInBalance === 0) {
        const newInBalance = openingBalance;
        const newAvailableQuantity = newInBalance - outBalance;
        const newTotalBalance = newAvailableQuantity;
        
        await updateDoc(doc(db, 'inventory', document.id), {
          inBalance: newInBalance,
          availableQuantity: newAvailableQuantity,
          totalBalance: newTotalBalance
        });
        
        updatedCount++;
        console.log(`Updated inventory item ${document.id}: inBalance = ${newInBalance}`);
      }
    }
    
    console.log(`Inventory migration completed. Updated ${updatedCount} items.`);
  } catch (error) {
    console.error('Error migrating inventory opening balance:', error);
    throw error;
  }
};

/**
 * Migration: Clean PELLETING invoice numbers by removing random suffixes
 */
export const cleanPelletingInvoiceNumbers = async (): Promise<void> => {
  try {
    console.log('Starting PELLETING invoice number cleanup...');
    
    const inventoryRef = collection(db, 'inventory');
    const q = query(inventoryRef, where('shipmentId', '!=', ''));
    const snapshot = await getDocs(q);
    
    let updatedCount = 0;
    
    for (const document of snapshot.docs) {
      const data = document.data();
      const shipmentId = data.shipmentId || '';
      
      // Check if shipmentId contains PELLETING with random suffix
      if (shipmentId.includes('PELLETING') && shipmentId !== 'PELLETING') {
        await updateDoc(doc(db, 'inventory', document.id), {
          shipmentId: 'PELLETING'
        });
        
        updatedCount++;
        console.log(`Cleaned shipmentId for item ${document.id}: ${shipmentId} → PELLETING`);
      }
    }
    
    console.log(`PELLETING cleanup completed. Updated ${updatedCount} items.`);
  } catch (error) {
    console.error('Error cleaning PELLETING invoice numbers:', error);
    throw error;
  }
};

/**
 * Migration: Remove duplicate credit note entries created for invoices
 */
/**
 * Remove credit/debit notes that reference direct purchases
 * These should not have been created for direct purchases
 */
export const removeDirectPurchaseDebitCreditNotes = async (): Promise<void> => {
  try {
    console.log('Starting removal of direct purchase debit/credit notes...');
    
    const notesRef = collection(db, 'debitCreditNotes');
    const directPurchasesRef = collection(db, 'directPurchases');
    
    // Get all direct purchase invoice numbers
    const purchasesSnapshot = await getDocs(directPurchasesRef);
    const directPurchaseInvoices = new Set<string>();
    
    purchasesSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.invoiceNumber) {
        directPurchaseInvoices.add(data.invoiceNumber);
      }
    });
    
    console.log(`Found ${directPurchaseInvoices.size} direct purchase invoice numbers`);
    
    // Get all debit/credit notes
    const notesSnapshot = await getDocs(notesRef);
    let deletedCount = 0;
    
    for (const document of notesSnapshot.docs) {
      const data = document.data();
      
      // Check if this note references a direct purchase invoice
      if (data.originalInvoiceNumber && directPurchaseInvoices.has(data.originalInvoiceNumber)) {
        await deleteDoc(doc(db, 'debitCreditNotes', document.id));
        deletedCount++;
        console.log(`Deleted note ${data.noteNumber} referencing direct purchase ${data.originalInvoiceNumber}`);
      }
    }
    
    console.log(`Direct purchase debit/credit note removal completed. Deleted ${deletedCount} notes.`);
  } catch (error) {
    console.error('Error removing direct purchase debit/credit notes:', error);
    throw error;
  }
};

/**
 * Remove duplicate credit notes from auto-generation
 */
export const removeDuplicateCreditNotes = async (): Promise<void> => {
  try {
    console.log('Starting duplicate credit note removal...');
    
    const notesRef = collection(db, 'debitCreditNotes');
    const snapshot = await getDocs(notesRef);
    
    let deletedCount = 0;
    
    for (const document of snapshot.docs) {
      const data = document.data();
      
      // Check if this is an auto-generated credit note from invoice
      // These have noteNumber matching systemInvoiceNumber and reason starting with "Sales Invoice"
      if (data.noteType === 'credit' && 
          data.transactionType === 'sale' && 
          data.reason && 
          data.reason.startsWith('Sales Invoice')) {
        
        await deleteDoc(doc(db, 'debitCreditNotes', document.id));
        deletedCount++;
        console.log(`Deleted duplicate credit note: ${data.noteNumber}`);
      }
    }
    
    console.log(`Duplicate credit note removal completed. Deleted ${deletedCount} notes.`);
  } catch (error) {
    console.error('Error removing duplicate credit notes:', error);
    throw error;
  }
};

/**
 * Migrate credit/debit note display logic
 * Updates existing records to match new display logic where:
 * - Credit notes show as CREDIT (income)
 * - Debit notes show as DEBIT (expense)
 * This doesn't change the data, just ensures calculations are consistent
 */
export const migrateCreditDebitNoteLogic = async (): Promise<void> => {
  try {
    console.log('Starting credit/debit note logic migration...');
    
    const notesRef = collection(db, 'debitCreditNotes');
    const snapshot = await getDocs(notesRef);
    let updatedCount = 0;
    
    console.log(`Found ${snapshot.size} credit/debit notes to check`);
    
    for (const document of snapshot.docs) {
      const data = document.data();
      
      // Just mark as migrated - the display logic is handled in the frontend
      // This migration ensures all notes are accounted for
      if (!data.migrated) {
        await updateDoc(doc(db, 'debitCreditNotes', document.id), {
          migrated: true,
          migratedAt: new Date().toISOString()
        });
        updatedCount++;
      }
    }
    
    console.log(`Credit/debit note migration completed. Updated ${updatedCount} notes.`);
  } catch (error) {
    console.error('Error migrating credit/debit notes:', error);
    throw error;
  }
};

/**
 * Run all migrations to fix existing data
 */
export const runAllMigrations = async (): Promise<void> => {
  try {
    console.log('Starting all migrations...');
    
    await migrateInventoryOpeningBalance();
    await cleanPelletingInvoiceNumbers();
    await removeDuplicateCreditNotes();
    await migrateCreditDebitNoteLogic();
    await removeDirectPurchaseDebitCreditNotes();
    
    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
};
