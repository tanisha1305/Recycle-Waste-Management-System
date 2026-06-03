import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  getDoc,
  query,
  orderBy,
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Customer } from '../components/CustomerList';
import { logCreate, logUpdate, logDelete, logError } from './activityLogService';
import { getCurrentUser } from './authService';

const CUSTOMERS_COLLECTION = 'customers';

// Convert Firestore timestamp to ISO string
const convertTimestamps = (data: Record<string, unknown>): Record<string, unknown> => {
  if (data?.createdAt && typeof data.createdAt === 'object' && 'toDate' in data.createdAt && typeof data.createdAt.toDate === 'function') {
    return { ...data, createdAt: data.createdAt.toDate().toISOString() };
  }
  return data;
};

// Helper function to remove undefined values from an object
const removeUndefinedFields = (obj: Record<string, unknown>): Record<string, unknown> => {
  const cleaned: Record<string, unknown> = {};
  
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    
    // Skip undefined values
    if (value === undefined) {
      return;
    }
    
    // Recursively clean nested objects
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      const cleanedNested = removeUndefinedFields(value as Record<string, unknown>);
      if (Object.keys(cleanedNested).length > 0) {
        cleaned[key] = cleanedNested;
      }
    } else {
      cleaned[key] = value;
    }
  });
  
  return cleaned;
};

// Add a new customer to Firestore
export const addCustomer = async (customer: Customer): Promise<string> => {
  const user = getCurrentUser();
  try {
    const customerData = {
      ...customer,
      createdAt: Timestamp.fromDate(new Date(customer.createdAt)),
      updatedAt: Timestamp.now(),
    };

    // Remove undefined fields before adding
    const cleanedData = removeUndefinedFields(customerData);

    const docRef = await addDoc(collection(db, CUSTOMERS_COLLECTION), cleanedData);
    console.log('Customer added with ID:', docRef.id);
    
    // Log activity
    if (user) {
      await logCreate(user.id, user.fullName, user.role, 'customers', customer.customerName, docRef.id, {
        customerCode: customer.customerCode,
        contactPerson: customer.contactPerson,
      });
    }
    
    return docRef.id;
  } catch (error) {
    console.error('Error adding customer:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'create', 'customers', 
        `Failed to create customer: ${customer.customerName}`, String(error));
    }
    throw error;
  }
};

// Get all customers from Firestore
export const getAllCustomers = async (): Promise<Customer[]> => {
  try {
    const q = query(collection(db, CUSTOMERS_COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const customers: Customer[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      customers.push({
        ...convertTimestamps(data),
        id: doc.id,
      } as Customer);
    });
    
    return customers;
  } catch (error) {
    console.error('Error getting customers:', error);
    throw error;
  }
};

// Get a single customer by ID
export const getCustomerById = async (id: string): Promise<Customer | null> => {
  try {
    const docRef = doc(db, CUSTOMERS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        ...convertTimestamps(data),
        id: docSnap.id,
      } as Customer;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting customer:', error);
    throw error;
  }
};

// Update a customer in Firestore
export const updateCustomer = async (id: string, customer: Partial<Customer>): Promise<void> => {
  const user = getCurrentUser();
  try {
    const docRef = doc(db, CUSTOMERS_COLLECTION, id);
    
    // Get previous data for logging
    const prevDoc = await getDoc(docRef);
    const prevData = prevDoc.exists() ? prevDoc.data() : null;
    
    const updateData: Record<string, unknown> = {
      ...customer,
      updatedAt: Timestamp.now(),
    };

    // Convert createdAt to Timestamp if it exists
    if (customer.createdAt) {
      updateData.createdAt = Timestamp.fromDate(new Date(customer.createdAt));
    }

    // Remove undefined fields before updating
    const cleanedData = removeUndefinedFields(updateData);

    await updateDoc(docRef, cleanedData);
    console.log('Customer updated successfully');
    
    // Log activity
    if (user) {
      await logUpdate(user.id, user.fullName, user.role, 'customers', 
        customer.customerName || prevData?.customerName || 'Customer', 
        prevData, cleanedData, id);
    }
  } catch (error) {
    console.error('Error updating customer:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'update', 'customers', 
        `Failed to update customer: ${customer.customerName || id}`, String(error));
    }
    throw error;
  }
};

// Delete a customer from Firestore
export const deleteCustomer = async (id: string): Promise<void> => {
  const user = getCurrentUser();
  try {
    const docRef = doc(db, CUSTOMERS_COLLECTION, id);
    
    // Get customer data before deletion for logging
    const docSnap = await getDoc(docRef);
    const customerData = docSnap.exists() ? docSnap.data() : null;
    
    await deleteDoc(docRef);
    console.log('Customer deleted successfully');
    
    // Log activity
    if (user) {
      await logDelete(user.id, user.fullName, user.role, 'customers', 
        customerData?.customerName || 'Customer', id);
    }
  } catch (error) {
    console.error('Error deleting customer:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'delete', 'customers', 
        `Failed to delete customer: ${id}`, String(error));
    }
    throw error;
  }
};

// Real-time listener for customers
export const subscribeToCustomers = (
  callback: (customers: Customer[]) => void,
  onError?: (error: Error) => void
) => {
  try {
    const q = query(collection(db, CUSTOMERS_COLLECTION), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const customers: Customer[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          customers.push({
            ...convertTimestamps(data),
            id: doc.id,
          } as Customer);
        });
        callback(customers);
      },
      (error) => {
        console.error('Error in customers subscription:', error);
        if (onError) onError(error as Error);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up customers subscription:', error);
    throw error;
  }
};
