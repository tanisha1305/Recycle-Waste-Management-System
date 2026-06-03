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
import { logCreate, logUpdate, logDelete, logError } from './activityLogService';
import { getCurrentUser } from './authService';

export interface InventoryItem {
  id: string;
  itemCode: string;
  itemName: string;
  itemDescription?: string;
  openingBalance: number;
  availableQuantity: number;
  inBalance: number;
  outBalance: number;
  totalBalance: number;
  unit: string;
  costPerKg?: number; // Cost per KG for this inventory batch (e.g., effective rate from pelleting)
  totalValue?: number; // Total value (inBalance × costPerKg)
  shipmentId?: string;
  shipmentDate: string;
  createdAt: string;
  updatedAt?: string;
}

const INVENTORY_COLLECTION = 'inventory';

// Add a new inventory item to Firestore
export const addInventoryItem = async (item: Omit<InventoryItem, 'id' | 'createdAt'>): Promise<string> => {
  const user = getCurrentUser();
  try {
    const now = Timestamp.now();
    const openingQty = Number(item.openingBalance) || 0;
    const inQty = Number(item.inBalance) || 0;
    const outQty = Number(item.outBalance) || 0;
    
    // IMPORTANT: inBalance should already include opening balance when passed from form
    // Don't add them together to avoid double counting
    // If inBalance is 0 but openingBalance exists, use openingBalance
    const totalInBalance = inQty > 0 ? inQty : openingQty;
    const availableQty = totalInBalance - outQty;
    
    const costPerKg = Number(item.costPerKg) || 0;
    const totalValue = costPerKg > 0 ? totalInBalance * costPerKg : 0;
    
    // Total Balance = Available Quantity × Effective Rate (stock value)
    const totalBalanceValue = costPerKg > 0 ? availableQty * costPerKg : 0;
    
    const itemData = {
      itemCode: item.itemCode || '',
      itemName: item.itemName || '',
      itemDescription: item.itemDescription || '',
      openingBalance: openingQty,
      availableQuantity: availableQty,
      inBalance: totalInBalance,
      outBalance: outQty,
      totalBalance: totalBalanceValue, // Stock value = available qty × rate
      unit: item.unit || 'KG',
      costPerKg: costPerKg,
      totalValue: totalValue,
      shipmentId: item.shipmentId || '',
      shipmentDate: item.shipmentDate || new Date().toISOString().split('T')[0],
      createdAt: now,
      updatedAt: now,
    };

    console.log('Adding inventory item to Firestore:', itemData);
    const docRef = await addDoc(collection(db, INVENTORY_COLLECTION), itemData);
    console.log('Inventory item added successfully with ID:', docRef.id);
    
    // Log activity
    if (user) {
      await logCreate(user.id, user.fullName, user.role, 'inventory', item.itemName, docRef.id, {
        itemCode: item.itemCode,
        openingBalance: item.openingBalance,
        unit: item.unit,
      });
    }
    
    return docRef.id;
  } catch (error) {
    console.error('Error adding inventory item:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'create', 'inventory', 
        `Failed to create inventory item: ${item.itemName}`, String(error));
    }
    throw error;
  }
};

// Get all inventory items from Firestore
export const getAllInventoryItems = async (): Promise<InventoryItem[]> => {
  try {
    const q = query(collection(db, INVENTORY_COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const items: InventoryItem[] = [];
    querySnapshot.forEach((docSnap) => {
      try {
        const data = docSnap.data();
        
        // Safely convert Timestamp to ISO string
        let createdAtStr = new Date().toISOString();
        let updatedAtStr: string | undefined = undefined;
        
        if (data.createdAt) {
          if (typeof data.createdAt.toDate === 'function') {
            createdAtStr = data.createdAt.toDate().toISOString();
          } else if (data.createdAt.seconds) {
            createdAtStr = new Date(data.createdAt.seconds * 1000).toISOString();
          }
        }
        
        if (data.updatedAt) {
          if (typeof data.updatedAt.toDate === 'function') {
            updatedAtStr = data.updatedAt.toDate().toISOString();
          } else if (data.updatedAt.seconds) {
            updatedAtStr = new Date(data.updatedAt.seconds * 1000).toISOString();
          }
        }
        
        items.push({
          id: docSnap.id,
          itemCode: data.itemCode || '',
          itemName: data.itemName || '',
          itemDescription: data.itemDescription || '',
          openingBalance: Number(data.openingBalance) || 0,
          availableQuantity: Number(data.availableQuantity) || Number(data.openingBalance) || 0,
          inBalance: Number(data.inBalance) || 0,
          outBalance: Number(data.outBalance) || 0,
          totalBalance: Number(data.totalBalance) || Number(data.openingBalance) || 0,
          unit: data.unit || 'KG',
          costPerKg: Number(data.costPerKg) || 0,
          totalValue: Number(data.totalValue) || 0,
          shipmentId: data.shipmentId || '',
          shipmentDate: data.shipmentDate || new Date().toISOString().split('T')[0],
          createdAt: createdAtStr,
          updatedAt: updatedAtStr,
        });
      } catch (docError) {
        console.error('Error processing document:', docSnap.id, docError);
      }
    });
    
    console.log(`Retrieved ${items.length} inventory items from Firestore`);
    return items;
  } catch (error) {
    console.error('Error getting inventory items:', error);
    throw error;
  }
};

// Update an inventory item in Firestore
export const updateInventoryItem = async (id: string, item: Partial<InventoryItem>): Promise<void> => {
  const user = getCurrentUser();
  try {
    const docRef = doc(db, INVENTORY_COLLECTION, id);
    
    // Get previous data for logging
    const prevDoc = await getDoc(docRef);
    const prevData = prevDoc.exists() ? prevDoc.data() : null;
    
    // Build update data with proper type conversion
    const updateData: Record<string, unknown> = { 
      updatedAt: Timestamp.now() 
    };
    
    // Only include fields that are provided (not undefined)
    if (item.itemCode !== undefined) updateData.itemCode = item.itemCode;
    if (item.itemName !== undefined) updateData.itemName = item.itemName;
    if (item.itemDescription !== undefined) updateData.itemDescription = item.itemDescription;
    if (item.openingBalance !== undefined) updateData.openingBalance = Number(item.openingBalance);
    if (item.availableQuantity !== undefined) updateData.availableQuantity = Number(item.availableQuantity);
    if (item.inBalance !== undefined) updateData.inBalance = Number(item.inBalance);
    if (item.outBalance !== undefined) updateData.outBalance = Number(item.outBalance);
    if (item.totalBalance !== undefined) updateData.totalBalance = Number(item.totalBalance);
    if (item.unit !== undefined) updateData.unit = item.unit;
    if (item.costPerKg !== undefined) updateData.costPerKg = Number(item.costPerKg);
    if (item.totalValue !== undefined) updateData.totalValue = Number(item.totalValue);
    if (item.shipmentId !== undefined) updateData.shipmentId = item.shipmentId;
    if (item.shipmentDate !== undefined) updateData.shipmentDate = item.shipmentDate;

    console.log('Updating inventory item:', id, updateData);
    await updateDoc(docRef, updateData);
    console.log('Inventory item updated successfully');
    
    // Log activity
    if (user) {
      await logUpdate(user.id, user.fullName, user.role, 'inventory', 
        item.itemName || prevData?.itemName || 'Inventory Item', 
        prevData, updateData, id);
    }
  } catch (error) {
    console.error('Error updating inventory item:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'update', 'inventory', 
        `Failed to update inventory item: ${item.itemName || id}`, String(error));
    }
    throw error;
  }
};

// Delete an inventory item from Firestore
export const deleteInventoryItem = async (id: string): Promise<void> => {
  const user = getCurrentUser();
  try {
    const docRef = doc(db, INVENTORY_COLLECTION, id);
    
    // Get item data before deletion for logging
    const docSnap = await getDoc(docRef);
    const itemData = docSnap.exists() ? docSnap.data() : null;
    
    await deleteDoc(docRef);
    console.log('Inventory item deleted successfully');
    
    // Log activity
    if (user) {
      await logDelete(user.id, user.fullName, user.role, 'inventory', 
        itemData?.itemName || 'Inventory Item', id);
    }
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'delete', 'inventory', 
        `Failed to delete inventory item: ${id}`, String(error));
    }
    throw error;
  }
};

// Real-time listener for inventory items
export const subscribeToInventoryItems = (
  callback: (items: InventoryItem[]) => void,
  onError?: (error: Error) => void
) => {
  try {
    const q = query(collection(db, INVENTORY_COLLECTION), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const items: InventoryItem[] = [];
        querySnapshot.forEach((docSnap) => {
          try {
            const data = docSnap.data();
            
            // Safely convert Timestamp to ISO string
            let createdAtStr = new Date().toISOString();
            let updatedAtStr: string | undefined = undefined;
            
            if (data.createdAt) {
              if (typeof data.createdAt.toDate === 'function') {
                createdAtStr = data.createdAt.toDate().toISOString();
              } else if (data.createdAt.seconds) {
                createdAtStr = new Date(data.createdAt.seconds * 1000).toISOString();
              }
            }
            
            if (data.updatedAt) {
              if (typeof data.updatedAt.toDate === 'function') {
                updatedAtStr = data.updatedAt.toDate().toISOString();
              } else if (data.updatedAt.seconds) {
                updatedAtStr = new Date(data.updatedAt.seconds * 1000).toISOString();
              }
            }
            
            items.push({
              id: docSnap.id,
              itemCode: data.itemCode || '',
              itemName: data.itemName || '',
              itemDescription: data.itemDescription || '',
              openingBalance: Number(data.openingBalance) || 0,
              availableQuantity: Number(data.availableQuantity) || Number(data.openingBalance) || 0,
              inBalance: Number(data.inBalance) || 0,
              outBalance: Number(data.outBalance) || 0,
              totalBalance: Number(data.totalBalance) || Number(data.openingBalance) || 0,
              unit: data.unit || 'KG',
              costPerKg: Number(data.costPerKg) || 0,
              totalValue: Number(data.totalValue) || 0,
              shipmentId: data.shipmentId || '',
              shipmentDate: data.shipmentDate || new Date().toISOString().split('T')[0],
              createdAt: createdAtStr,
              updatedAt: updatedAtStr,
            });
          } catch (docError) {
            console.error('Error processing document:', docSnap.id, docError);
          }
        });
        console.log(`Real-time update: ${items.length} inventory items`);
        callback(items);
      },
      (error) => {
        console.error('Error in inventory subscription:', error);
        if (onError) onError(error as Error);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up inventory subscription:', error);
    throw error;
  }
};
