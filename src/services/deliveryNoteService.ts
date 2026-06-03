import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query,
  orderBy,
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface DeliveryNoteItem {
  itemCode: string;
  itemDescription: string;
  quantity: number;
  unitOfMeasure: string;
  remarks?: string;
}

export interface DeliveryNote {
  id: string;
  deliveryNoteNumber: string;
  date: string;
  customerName: string;
  customerAddress: string;
  customerContact: string;
  deliveryAddress: string;
  deliveryFrom: {
    name: string;
    address: string;
    contact: string;
  };
  items: DeliveryNoteItem[];
  transporterName?: string;
  vehicleNumber?: string;
  driverName?: string;
  driverContact?: string;
  specialInstructions?: string;
  status: 'pending' | 'in-transit' | 'delivered' | 'cancelled';
  deliveredAt?: string;
  receivedBy?: string;
  createdAt: string;
}

const DELIVERY_NOTES_COLLECTION = 'deliveryNotes';

// Add a new delivery note to Firestore
export const addDeliveryNote = async (note: Omit<DeliveryNote, 'createdAt'>): Promise<string> => {
  try {
    const noteData = {
      ...note,
      createdAt: Timestamp.now(),
    };

    const docRef = await addDoc(collection(db, DELIVERY_NOTES_COLLECTION), noteData);
    console.log('Delivery note added with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error adding delivery note:', error);
    throw error;
  }
};

// Update an existing delivery note in Firestore
export const updateDeliveryNote = async (id: string, note: Partial<DeliveryNote>): Promise<void> => {
  try {
    const docRef = doc(db, DELIVERY_NOTES_COLLECTION, id);
    
    // Filter out undefined values to prevent Firestore errors
    const updateData: Record<string, unknown> = { updatedAt: Timestamp.now() };
    
    Object.keys(note).forEach(key => {
      const value = note[key as keyof DeliveryNote];
      if (value !== undefined) {
        updateData[key] = value;
      }
    });
    
    await updateDoc(docRef, updateData);
    console.log('Delivery note updated with ID:', id);
  } catch (error) {
    console.error('Error updating delivery note:', error);
    throw error;
  }
};

// Delete a delivery note from Firestore
export const deleteDeliveryNote = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, DELIVERY_NOTES_COLLECTION, id);
    await deleteDoc(docRef);
    console.log('Delivery note deleted with ID:', id);
  } catch (error) {
    console.error('Error deleting delivery note:', error);
    throw error;
  }
};

// Get all delivery notes from Firestore
export const getAllDeliveryNotes = async (): Promise<DeliveryNote[]> => {
  try {
    const q = query(collection(db, DELIVERY_NOTES_COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const notes: DeliveryNote[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      notes.push({
        id: doc.id,
        deliveryNoteNumber: data.deliveryNoteNumber || '',
        date: data.date || '',
        customerName: data.customerName || '',
        customerAddress: data.customerAddress || '',
        customerContact: data.customerContact || '',
        deliveryAddress: data.deliveryAddress || '',
        deliveryFrom: data.deliveryFrom || { name: '', address: '', contact: '' },
        items: data.items || [],
        transporterName: data.transporterName,
        vehicleNumber: data.vehicleNumber,
        driverName: data.driverName,
        driverContact: data.driverContact,
        specialInstructions: data.specialInstructions,
        status: data.status || 'pending',
        deliveredAt: data.deliveredAt,
        receivedBy: data.receivedBy,
        createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
      });
    });
    
    return notes;
  } catch (error) {
    console.error('Error getting delivery notes:', error);
    throw error;
  }
};

// Subscribe to delivery notes in real-time
export const subscribeToDeliveryNotes = (
  callback: (notes: DeliveryNote[]) => void,
  errorCallback?: (error: Error) => void
) => {
  try {
    const q = query(collection(db, DELIVERY_NOTES_COLLECTION), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notes: DeliveryNote[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          notes.push({
            id: doc.id,
            deliveryNoteNumber: data.deliveryNoteNumber || '',
            date: data.date || '',
            customerName: data.customerName || '',
            customerAddress: data.customerAddress || '',
            customerContact: data.customerContact || '',
            deliveryAddress: data.deliveryAddress || '',
            deliveryFrom: data.deliveryFrom || { name: '', address: '', contact: '' },
            items: data.items || [],
            transporterName: data.transporterName,
            vehicleNumber: data.vehicleNumber,
            driverName: data.driverName,
            driverContact: data.driverContact,
            specialInstructions: data.specialInstructions,
            status: data.status || 'pending',
            deliveredAt: data.deliveredAt,
            receivedBy: data.receivedBy,
            createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
          });
        });
        callback(notes);
      },
      (error) => {
        console.error('Error subscribing to delivery notes:', error);
        if (errorCallback) {
          errorCallback(error as Error);
        }
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up delivery notes subscription:', error);
    throw error;
  }
};
