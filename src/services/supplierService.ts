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
import { Supplier } from '../components/SupplierList';
import { logCreate, logUpdate, logDelete, logError } from './activityLogService';
import { getCurrentUser } from './authService';

const SUPPLIERS_COLLECTION = 'suppliers';

// Convert Firestore timestamp to ISO string
const convertTimestamps = (data: Record<string, unknown>): Record<string, unknown> => {
  if (data?.createdAt && typeof data.createdAt === 'object' && 'toDate' in data.createdAt && typeof data.createdAt.toDate === 'function') {
    return { ...data, createdAt: data.createdAt.toDate().toISOString() };
  }
  return data;
};

// Add a new supplier to Firestore
export const addSupplier = async (supplier: Supplier): Promise<string> => {
  const user = getCurrentUser();
  try {
    const supplierData = {
      ...supplier,
      createdAt: Timestamp.fromDate(new Date(supplier.createdAt)),
      updatedAt: Timestamp.now(),
    };

    const docRef = await addDoc(collection(db, SUPPLIERS_COLLECTION), supplierData);
    console.log('Supplier added with ID:', docRef.id);
    
    // Log activity
    if (user) {
      await logCreate(user.id, user.fullName, user.role, 'suppliers', supplier.supplierName, docRef.id, {
        supplierCode: supplier.supplierCode,
        contactPerson: supplier.contactPerson,
      });
    }
    
    return docRef.id;
  } catch (error) {
    console.error('Error adding supplier:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'create', 'suppliers', 
        `Failed to create supplier: ${supplier.supplierName}`, String(error));
    }
    throw error;
  }
};

// Get all suppliers from Firestore
export const getAllSuppliers = async (): Promise<Supplier[]> => {
  try {
    const q = query(collection(db, SUPPLIERS_COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const suppliers: Supplier[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      suppliers.push({
        ...convertTimestamps(data),
        id: doc.id,
      } as Supplier);
    });
    
    return suppliers;
  } catch (error) {
    console.error('Error getting suppliers:', error);
    throw error;
  }
};

// Get a single supplier by ID
export const getSupplierById = async (id: string): Promise<Supplier | null> => {
  try {
    const docRef = doc(db, SUPPLIERS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        ...convertTimestamps(data),
        id: docSnap.id,
      } as Supplier;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting supplier:', error);
    throw error;
  }
};

// Update a supplier in Firestore
export const updateSupplier = async (id: string, supplier: Partial<Supplier>): Promise<void> => {
  const user = getCurrentUser();
  try {
    const docRef = doc(db, SUPPLIERS_COLLECTION, id);
    
    // Get previous data for logging
    const prevDoc = await getDoc(docRef);
    const prevData = prevDoc.exists() ? prevDoc.data() : null;
    
    const updateData: Record<string, unknown> = {
      ...supplier,
      updatedAt: Timestamp.now(),
    };

    // Convert createdAt to Timestamp if it exists
    if (supplier.createdAt) {
      updateData.createdAt = Timestamp.fromDate(new Date(supplier.createdAt));
    }

    await updateDoc(docRef, updateData);
    console.log('Supplier updated successfully');
    
    // Log activity
    if (user) {
      await logUpdate(user.id, user.fullName, user.role, 'suppliers', 
        supplier.supplierName || prevData?.supplierName || 'Supplier', 
        prevData, updateData, id);
    }
  } catch (error) {
    console.error('Error updating supplier:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'update', 'suppliers', 
        `Failed to update supplier: ${supplier.supplierName || id}`, String(error));
    }
    throw error;
  }
};

// Delete a supplier from Firestore
export const deleteSupplier = async (id: string): Promise<void> => {
  const user = getCurrentUser();
  try {
    const docRef = doc(db, SUPPLIERS_COLLECTION, id);
    
    // Get supplier data before deletion for logging
    const docSnap = await getDoc(docRef);
    const supplierData = docSnap.exists() ? docSnap.data() : null;
    
    await deleteDoc(docRef);
    console.log('Supplier deleted successfully');
    
    // Log activity
    if (user) {
      await logDelete(user.id, user.fullName, user.role, 'suppliers', 
        supplierData?.supplierName || 'Supplier', id);
    }
  } catch (error) {
    console.error('Error deleting supplier:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'delete', 'suppliers', 
        `Failed to delete supplier: ${id}`, String(error));
    }
    throw error;
  }
};

// Real-time listener for suppliers
export const subscribeToSuppliers = (
  callback: (suppliers: Supplier[]) => void,
  onError?: (error: Error) => void
) => {
  try {
    const q = query(collection(db, SUPPLIERS_COLLECTION), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const suppliers: Supplier[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          suppliers.push({
            ...convertTimestamps(data),
            id: doc.id,
          } as Supplier);
        });
        callback(suppliers);
      },
      (error) => {
        console.error('Error in suppliers subscription:', error);
        if (onError) onError(error as Error);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up suppliers subscription:', error);
    throw error;
  }
};
