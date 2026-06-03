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
import { DebitCreditNote } from '../types';

const DEBIT_CREDIT_NOTES_COLLECTION = 'debitCreditNotes';

// Add a new debit/credit note to Firestore
export const addDebitCreditNote = async (note: Omit<DebitCreditNote, 'id' | 'createdAt'>): Promise<string> => {
  try {
    const now = Timestamp.now();
    const noteData = {
      ...note,
      createdAt: now,
    };

    console.log('Adding debit/credit note to Firestore:', noteData);
    const docRef = await addDoc(collection(db, DEBIT_CREDIT_NOTES_COLLECTION), noteData);
    console.log('Debit/Credit note added successfully with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error adding debit/credit note:', error);
    throw error;
  }
};

// Get all debit/credit notes from Firestore
export const getAllDebitCreditNotes = async (): Promise<DebitCreditNote[]> => {
  try {
    const q = query(collection(db, DEBIT_CREDIT_NOTES_COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const notes: DebitCreditNote[] = [];
    querySnapshot.forEach((docSnap) => {
      try {
        const data = docSnap.data();
        
        // Safely convert Timestamp to ISO string
        let createdAtStr = new Date().toISOString();
        
        if (data.createdAt) {
          if (typeof data.createdAt.toDate === 'function') {
            createdAtStr = data.createdAt.toDate().toISOString();
          } else if (data.createdAt.seconds) {
            createdAtStr = new Date(data.createdAt.seconds * 1000).toISOString();
          }
        }
        
        notes.push({
          id: docSnap.id,
          noteNumber: data.noteNumber || '',
          noteType: data.noteType || 'credit',
          transactionType: data.transactionType || 'sale',
          date: data.date || new Date().toISOString().split('T')[0],
          partyType: data.partyType || 'customer',
          partyName: data.partyName || '',
          partyCode: data.partyCode || '',
          originalInvoiceNumber: data.originalInvoiceNumber || '',
          reason: data.reason || '',
          items: data.items || [],
          subtotal: Number(data.subtotal) || 0,
          tax: Number(data.tax) || 0,
          totalAmount: Number(data.totalAmount) || 0,
          status: data.status || 'draft',
          remarks: data.remarks || '',
          createdAt: createdAtStr,
        });
      } catch (docError) {
        console.error('Error processing document:', docSnap.id, docError);
      }
    });
    
    console.log(`Retrieved ${notes.length} debit/credit notes from Firestore`);
    return notes;
  } catch (error) {
    console.error('Error getting debit/credit notes:', error);
    throw error;
  }
};

// Update a debit/credit note in Firestore
export const updateDebitCreditNote = async (id: string, note: Partial<DebitCreditNote>): Promise<void> => {
  try {
    const docRef = doc(db, DEBIT_CREDIT_NOTES_COLLECTION, id);
    
    // Remove id and createdAt from update data
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _createdAt, ...updateData } = note as DebitCreditNote;

    console.log('Updating debit/credit note:', id, updateData);
    await updateDoc(docRef, updateData);
    console.log('Debit/Credit note updated successfully');
  } catch (error) {
    console.error('Error updating debit/credit note:', error);
    throw error;
  }
};

// Delete a debit/credit note from Firestore
export const deleteDebitCreditNote = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, DEBIT_CREDIT_NOTES_COLLECTION, id);
    
    // Delete the note document
    await deleteDoc(docRef);
    console.log('Debit/Credit note deleted successfully');
    
    // NOTE: We do NOT delete the parent invoice or purchase when deleting a note
    // A debit/credit note is just an adjustment to the original transaction
    // Deleting the note should only reverse the adjustment, not delete the original transaction
  } catch (error) {
    console.error('Error deleting debit/credit note:', error);
    throw error;
  }
};

// Real-time listener for debit/credit notes
export const subscribeToDebitCreditNotes = (
  callback: (notes: DebitCreditNote[]) => void,
  onError?: (error: Error) => void
) => {
  try {
    const q = query(collection(db, DEBIT_CREDIT_NOTES_COLLECTION), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const notes: DebitCreditNote[] = [];
        querySnapshot.forEach((docSnap) => {
          try {
            const data = docSnap.data();
            
            // Safely convert Timestamp to ISO string
            let createdAtStr = new Date().toISOString();
            
            if (data.createdAt) {
              if (typeof data.createdAt.toDate === 'function') {
                createdAtStr = data.createdAt.toDate().toISOString();
              } else if (data.createdAt.seconds) {
                createdAtStr = new Date(data.createdAt.seconds * 1000).toISOString();
              }
            }
            
            notes.push({
              id: docSnap.id,
              noteNumber: data.noteNumber || '',
              noteType: data.noteType || 'credit',
              transactionType: data.transactionType || 'sale',
              date: data.date || new Date().toISOString().split('T')[0],
              partyType: data.partyType || 'customer',
              partyName: data.partyName || '',
              partyCode: data.partyCode || '',
              originalInvoiceNumber: data.originalInvoiceNumber || '',
              reason: data.reason || '',
              items: data.items || [],
              subtotal: Number(data.subtotal) || 0,
              tax: Number(data.tax) || 0,
              totalAmount: Number(data.totalAmount) || 0,
              status: data.status || 'draft',
              remarks: data.remarks || '',
              createdAt: createdAtStr,
            });
          } catch (docError) {
            console.error('Error processing document:', docSnap.id, docError);
          }
        });
        console.log(`Real-time update: ${notes.length} debit/credit notes`);
        callback(notes);
      },
      (error) => {
        console.error('Error in debit/credit notes subscription:', error);
        if (onError) onError(error as Error);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up debit/credit notes subscription:', error);
    throw error;
  }
};
