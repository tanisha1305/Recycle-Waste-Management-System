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
import { Shipment } from '../types';
import { logCreate, logUpdate, logDelete, logError } from './activityLogService';
import { getCurrentUser } from './authService';

const SHIPMENTS_COLLECTION = 'shipments';

// Convert Firestore timestamp to ISO string
const convertTimestamps = (data: Record<string, unknown>): Record<string, unknown> => {
  const result = { ...data };
  
  // Convert date field
  if (result.date && typeof result.date === 'object' && 'toDate' in result.date && typeof result.date.toDate === 'function') {
    result.date = result.date.toDate().toISOString();
  }
  // If it's already a string, no conversion needed
  
  // Convert completedAt timestamps in processing stages
  if (result.processingStages && typeof result.processingStages === 'object') {
    const stages = result.processingStages as Record<string, unknown>;
    Object.keys(stages).forEach(stageKey => {
      const stage = stages[stageKey] as Record<string, unknown>;
      if (stage && typeof stage === 'object' && stage.completedAt && typeof stage.completedAt === 'object' && 'toDate' in stage.completedAt) {
        stage.completedAt = (stage.completedAt as { toDate: () => Date }).toDate().toISOString();
      }
    });
  }
  
  return result;
};

// Add a new shipment to Firestore
export const addShipment = async (shipment: Shipment): Promise<string> => {
  const user = getCurrentUser();
  try {
    const shipmentData = {
      ...shipment,
      // Keep date as string for easier display
      date: shipment.date,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Remove undefined fields before adding
    const cleanedData = removeUndefinedFields(shipmentData);

    const docRef = await addDoc(collection(db, SHIPMENTS_COLLECTION), cleanedData);
    console.log('Shipment added with ID:', docRef.id);
    
    // Log activity
    if (user) {
      await logCreate(user.id, user.fullName, user.role, 'shipments', 
        `Shipment for ${shipment.supplier}`, docRef.id, {
          supplier: shipment.supplier,
          purchaseKg: shipment.purchaseKg,
          totalCost: shipment.totalCost,
        });
    }
    
    return docRef.id;
  } catch (error) {
    console.error('Error adding shipment:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'create', 'shipments', 
        `Failed to create shipment for ${shipment.supplier}`, String(error));
    }
    throw error;
  }
};

// Get all shipments from Firestore
export const getAllShipments = async (): Promise<Shipment[]> => {
  try {
    const q = query(collection(db, SHIPMENTS_COLLECTION), orderBy('date', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const shipments: Shipment[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      shipments.push({
        ...convertTimestamps(data),
        id: doc.id,
      } as Shipment);
    });
    
    return shipments;
  } catch (error) {
    console.error('Error getting shipments:', error);
    throw error;
  }
};

// Get a single shipment by ID
export const getShipmentById = async (id: string): Promise<Shipment | null> => {
  try {
    const docRef = doc(db, SHIPMENTS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        ...convertTimestamps(data),
        id: docSnap.id,
      } as Shipment;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting shipment:', error);
    throw error;
  }
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

// Update a shipment in Firestore
export const updateShipment = async (id: string, shipment: Partial<Shipment>): Promise<void> => {
  const user = getCurrentUser();
  try {
    const docRef = doc(db, SHIPMENTS_COLLECTION, id);
    
    // Get previous data for logging
    const prevDoc = await getDoc(docRef);
    const prevData = prevDoc.exists() ? prevDoc.data() : null;
    
    const updateData: Record<string, unknown> = {
      ...shipment,
      updatedAt: Timestamp.now(),
    };

    // Keep date as string (no conversion needed)
    // Date is already in string format from the shipment object

    // Remove undefined fields before updating
    const cleanedData = removeUndefinedFields(updateData);

    await updateDoc(docRef, cleanedData);
    console.log('Shipment updated successfully');
    
    // Log activity
    if (user) {
      await logUpdate(user.id, user.fullName, user.role, 'shipments', 
        shipment.supplier || prevData?.supplier || 'Shipment', 
        prevData, updateData, id);
    }
  } catch (error) {
    console.error('Error updating shipment:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'update', 'shipments', 
        `Failed to update shipment: ${id}`, String(error));
    }
    throw error;
  }
};

// Delete a shipment from Firestore
export const deleteShipment = async (id: string): Promise<void> => {
  const user = getCurrentUser();
  try {
    const docRef = doc(db, SHIPMENTS_COLLECTION, id);
    
    // Get shipment data before deletion for logging
    const docSnap = await getDoc(docRef);
    const shipmentData = docSnap.exists() ? docSnap.data() : null;
    
    await deleteDoc(docRef);
    console.log('Shipment deleted successfully');
    
    // Log activity
    if (user) {
      await logDelete(user.id, user.fullName, user.role, 'shipments', 
        shipmentData?.supplier || 'Shipment', id);
    }
  } catch (error) {
    console.error('Error deleting shipment:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'delete', 'shipments', 
        `Failed to delete shipment: ${id}`, String(error));
    }
    throw error;
  }
};

// Real-time listener for shipments
export const subscribeToShipments = (
  callback: (shipments: Shipment[]) => void,
  onError?: (error: Error) => void
) => {
  try {
    const q = query(collection(db, SHIPMENTS_COLLECTION), orderBy('date', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const shipments: Shipment[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          shipments.push({
            ...convertTimestamps(data),
            id: doc.id,
          } as Shipment);
        });
        callback(shipments);
      },
      (error) => {
        console.error('Error in shipments subscription:', error);
        if (onError) onError(error as Error);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up shipments subscription:', error);
    throw error;
  }
};
