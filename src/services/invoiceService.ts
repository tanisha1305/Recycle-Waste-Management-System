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
  onSnapshot,
  where
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Invoice } from '../components/InvoiceManagement';

const INVOICES_COLLECTION = 'invoices';

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

// Add a new invoice to Firestore
export const addInvoice = async (invoice: Invoice): Promise<string> => {
  try {
    const invoiceData = {
      ...invoice,
      createdAt: Timestamp.fromDate(new Date(invoice.createdAt)),
      updatedAt: Timestamp.now(),
    };

    // Remove undefined fields before adding
    const cleanedData = removeUndefinedFields(invoiceData);

    const docRef = await addDoc(collection(db, INVOICES_COLLECTION), cleanedData);
    console.log('Invoice added with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error adding invoice:', error);
    throw error;
  }
};

// Get all invoices from Firestore
export const getAllInvoices = async (): Promise<Invoice[]> => {
  try {
    const q = query(collection(db, INVOICES_COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const invoices: Invoice[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      invoices.push({
        ...convertTimestamps(data),
        id: doc.id,
      } as Invoice);
    });
    
    return invoices;
  } catch (error) {
    console.error('Error getting invoices:', error);
    throw error;
  }
};

// Get a single invoice by ID
export const getInvoiceById = async (id: string): Promise<Invoice | null> => {
  try {
    const docRef = doc(db, INVOICES_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        ...convertTimestamps(data),
        id: docSnap.id,
      } as Invoice;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting invoice:', error);
    throw error;
  }
};

// Update an invoice in Firestore
export const updateInvoice = async (id: string, invoice: Partial<Invoice>): Promise<void> => {
  try {
    const docRef = doc(db, INVOICES_COLLECTION, id);
    
    const updateData: Record<string, unknown> = {
      ...invoice,
      updatedAt: Timestamp.now(),
    };

    // Convert createdAt to Timestamp if it exists
    if (invoice.createdAt) {
      updateData.createdAt = Timestamp.fromDate(new Date(invoice.createdAt));
    }

    // Remove undefined fields before updating
    const cleanedData = removeUndefinedFields(updateData);

    await updateDoc(docRef, cleanedData);
    console.log('Invoice updated successfully');
  } catch (error) {
    console.error('Error updating invoice:', error);
    throw error;
  }
};

// Delete an invoice from Firestore
export const deleteInvoice = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, INVOICES_COLLECTION, id);
    
    // Get invoice data before deletion to find related credit note
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const invoiceData = docSnap.data();
      const systemInvoiceNumber = invoiceData.systemInvoiceNumber;
      
      // Delete invoice
      await deleteDoc(docRef);
      console.log('Invoice deleted successfully');
      
      // Delete related credit note (if exists)
      if (systemInvoiceNumber) {
        try {
          const notesQuery = query(
            collection(db, 'debitCreditNotes'),
            where('originalInvoiceNumber', '==', systemInvoiceNumber),
            where('noteType', '==', 'credit'),
            where('transactionType', '==', 'sale')
          );
          const notesSnapshot = await getDocs(notesQuery);
          
          for (const noteDoc of notesSnapshot.docs) {
            await deleteDoc(doc(db, 'debitCreditNotes', noteDoc.id));
            console.log(`Auto-deleted related credit note: ${noteDoc.id}`);
          }
        } catch (noteError) {
          console.error('Error deleting related credit note:', noteError);
          // Don't throw - invoice is already deleted
        }
      }
    } else {
      await deleteDoc(docRef);
      console.log('Invoice deleted successfully');
    }
  } catch (error) {
    console.error('Error deleting invoice:', error);
    throw error;
  }
};

// Real-time listener for invoices
export const subscribeToInvoices = (
  callback: (invoices: Invoice[]) => void,
  onError?: (error: Error) => void
) => {
  try {
    const q = query(collection(db, INVOICES_COLLECTION), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const invoices: Invoice[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          invoices.push({
            ...convertTimestamps(data),
            id: doc.id,
          } as Invoice);
        });
        callback(invoices);
      },
      (error) => {
        console.error('Error in invoices subscription:', error);
        if (onError) onError(error as Error);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up invoices subscription:', error);
    throw error;
  }
};
