import { 
  collection, 
  addDoc, 
  getDocs, 
  query,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { logCreate, logError } from './activityLogService';
import { getCurrentUser } from './authService';

export interface InventoryAdjustment {
  id?: string;
  itemCode: string;
  itemName: string;
  adjustmentQuantity: number; // Can be positive or negative
  previousBalance: number;
  newBalance: number;
  unit: string;
  reason?: string;
  adjustedBy: string;
  adjustedByName: string;
  adjustmentDate: string;
  createdAt: Timestamp | string;
}

const ADJUSTMENT_COLLECTION = 'inventory_adjustments';

// Add a new inventory adjustment
export const addInventoryAdjustment = async (adjustment: Omit<InventoryAdjustment, 'id' | 'createdAt'>): Promise<string> => {
  const user = getCurrentUser();
  try {
    const now = Timestamp.now();
    
    const adjustmentData = {
      itemCode: adjustment.itemCode,
      itemName: adjustment.itemName,
      adjustmentQuantity: adjustment.adjustmentQuantity,
      previousBalance: adjustment.previousBalance,
      newBalance: adjustment.newBalance,
      unit: adjustment.unit,
      reason: adjustment.reason || 'Manual adjustment',
      adjustedBy: adjustment.adjustedBy,
      adjustedByName: adjustment.adjustedByName,
      adjustmentDate: adjustment.adjustmentDate,
      createdAt: now,
    };

    console.log('Adding inventory adjustment to Firestore:', adjustmentData);
    const docRef = await addDoc(collection(db, ADJUSTMENT_COLLECTION), adjustmentData);
    console.log('Inventory adjustment added successfully with ID:', docRef.id);
    
    // Log activity
    if (user) {
      await logCreate(user.id, user.fullName, user.role, 'inventory', adjustment.itemName, docRef.id, {
        adjustmentQuantity: adjustment.adjustmentQuantity,
        previousBalance: adjustment.previousBalance,
        newBalance: adjustment.newBalance,
      });
    }
    
    return docRef.id;
  } catch (error) {
    console.error('Error adding inventory adjustment:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'create', 'inventory', 
        `Failed to create adjustment for: ${adjustment.itemName}`, String(error));
    }
    throw error;
  }
};

// Get all inventory adjustments
export const getInventoryAdjustments = async (): Promise<InventoryAdjustment[]> => {
  try {
    const q = query(collection(db, ADJUSTMENT_COLLECTION), orderBy('adjustmentDate', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const adjustments: InventoryAdjustment[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      adjustments.push({
        id: doc.id,
        itemCode: data.itemCode || '',
        itemName: data.itemName || '',
        adjustmentQuantity: data.adjustmentQuantity || 0,
        previousBalance: data.previousBalance || 0,
        newBalance: data.newBalance || 0,
        unit: data.unit || 'KG',
        reason: data.reason || '',
        adjustedBy: data.adjustedBy || '',
        adjustedByName: data.adjustedByName || '',
        adjustmentDate: data.adjustmentDate || new Date().toISOString().split('T')[0],
        createdAt: data.createdAt || new Date().toISOString(),
      });
    });
    
    return adjustments;
  } catch (error) {
    console.error('Error fetching inventory adjustments:', error);
    throw error;
  }
};
