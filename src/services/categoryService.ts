import { 
  collection, 
  addDoc, 
  onSnapshot,
  query,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';

const CATEGORIES_COLLECTION = 'categories';

// Get all categories from Firestore (one-time fetch)
export const getAllCategories = async (): Promise<string[]> => {
  const q = query(collection(db, CATEGORIES_COLLECTION));
  const snapshot = await getDocs(q);
  
  const categoriesSet = new Set<string>();
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data?.name && typeof data.name === 'string') {
      categoriesSet.add(data.name);
    }
  });
  
  return Array.from(categoriesSet).sort();
};

// Subscribe to categories from Firestore
export const subscribeToCategories = (callback: (categories: string[]) => void) => {
  const q = query(collection(db, CATEGORIES_COLLECTION));
  
  return onSnapshot(q, (snapshot) => {
    const categoriesSet = new Set<string>();
    
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data && data.name) {
        categoriesSet.add(data.name);
      }
    });
    
    callback(Array.from(categoriesSet).sort());
  }, (error) => {
    console.error('Categories subscription error:', error);
  });
};

// Add a new category to Firestore
export const addCategory = async (categoryName: string): Promise<void> => {
  // Check if category already exists
  const q = query(collection(db, CATEGORIES_COLLECTION));
  const snapshot = await getDocs(q);
  
  const exists = snapshot.docs.some(doc => doc.data().name === categoryName);
  if (exists) {
    console.log('Category already exists:', categoryName);
    throw new Error('Category already exists');
  }
  
  await addDoc(collection(db, CATEGORIES_COLLECTION), {
    name: categoryName,
    createdAt: Timestamp.now()
  });
  console.log('Category added successfully:', categoryName);
};

// Initialize default categories if none exist
export const initializeDefaultCategories = async (): Promise<void> => {
  try {
    const q = query(collection(db, CATEGORIES_COLLECTION));
    const snapshot = await getDocs(q);
    
    // If categories already exist, don't initialize
    if (!snapshot.empty) {
      return;
    }
    
    const defaultCategories = [
      'Material Purchase',
      'Sales',
      'Operating Expense',
      'Salary',
      'Utilities',
      'Maintenance',
      'Transport',
      'Equipment',
      'Product Sales',
      'Material Sales',
      'Balance Adjustment',
      'Bank Transfer',
      'Bank Charges',
      'Service Income',
      'Investment Return',
      'Salary & Wages',
      'Transportation',
      'Other Income',
      'Other Expense',
      'Other'
    ];
    
    // Add all default categories
    const promises = defaultCategories.map(category => 
      addDoc(collection(db, CATEGORIES_COLLECTION), {
        name: category,
        createdAt: Timestamp.now()
      })
    );
    
    await Promise.all(promises);
    console.log('Default categories initialized successfully');
  } catch (error) {
    console.error('Error initializing default categories:', error);
    throw error;
  }
};

// Ensure all required categories exist (adds missing ones)
export const ensureRequiredCategories = async (): Promise<void> => {
  try {
    const q = query(collection(db, CATEGORIES_COLLECTION));
    const snapshot = await getDocs(q);
    
    // Get existing category names
    const existingCategories = new Set<string>();
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data?.name) {
        existingCategories.add(data.name);
      }
    });
    
    const requiredCategories = [
      'Material Purchase',
      'Sales',
      'Operating Expense',
      'Salary',
      'Utilities',
      'Maintenance',
      'Transport',
      'Equipment',
      'Product Sales',
      'Material Sales',
      'Balance Adjustment',
      'Bank Transfer',
      'Bank Charges',
      'Service Income',
      'Investment Return',
      'Salary & Wages',
      'Transportation',
      'Other Income',
      'Other Expense',
      'Other'
    ];
    
    // Find missing categories
    const missingCategories = requiredCategories.filter(
      cat => !existingCategories.has(cat)
    );
    
    if (missingCategories.length > 0) {
      console.log('Adding missing categories:', missingCategories);
      
      // Add missing categories
      const promises = missingCategories.map(category => 
        addDoc(collection(db, CATEGORIES_COLLECTION), {
          name: category,
          createdAt: Timestamp.now()
        })
      );
      
      await Promise.all(promises);
      console.log('Missing categories added successfully');
    } else {
      console.log('All required categories already exist');
    }
  } catch (error) {
    console.error('Error ensuring required categories:', error);
    throw error;
  }
};
