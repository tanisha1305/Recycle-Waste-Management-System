import { 
  doc, 
  getDoc,
  setDoc,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';

const COMPANY_COLLECTION = 'companyDetails';
const COMPANY_DOC_ID = 'company'; // Single document for company info

export interface CompanyDetails {
  id: string;
  companyPIN: string;
  companyName: string;
  address: string;
  mobile: string;
  email: string;
  updatedAt: string;
  updatedBy?: string;
}

// Convert Firestore timestamp to ISO string
const convertTimestamps = (data: Record<string, unknown>): Record<string, unknown> => {
  if (data?.updatedAt && typeof data.updatedAt === 'object' && 'toDate' in data.updatedAt && typeof data.updatedAt.toDate === 'function') {
    return { ...data, updatedAt: data.updatedAt.toDate().toISOString() };
  }
  return data;
};

// Get company details
export const getCompanyDetails = async (): Promise<CompanyDetails> => {
  try {
    const docRef = doc(db, COMPANY_COLLECTION, COMPANY_DOC_ID);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = convertTimestamps(docSnap.data());
      return {
        ...data,
        id: docSnap.id
      } as CompanyDetails;
    } else {
      // Return default company details if not found
      const defaultDetails: CompanyDetails = {
        id: COMPANY_DOC_ID,
        companyPIN: 'P052210668Q',
        companyName: 'DONATO IMPEX LIMITED',
        address: 'P.O. BOX 12345, NAIROBI',
        mobile: '+254 700 000 000',
        email: 'abc@mail.com',
        updatedAt: new Date().toISOString()
      };
      
      // Initialize with default values
      await setDoc(docRef, {
        companyPIN: defaultDetails.companyPIN,
        companyName: defaultDetails.companyName,
        address: defaultDetails.address,
        mobile: defaultDetails.mobile,
        email: defaultDetails.email,
        updatedAt: Timestamp.now()
      });
      
      return defaultDetails;
    }
  } catch (error) {
    console.error('Error fetching company details:', error);
    throw error;
  }
};

// Update company details
export const updateCompanyDetails = async (
  details: Omit<CompanyDetails, 'id' | 'updatedAt'>,
  updatedBy?: string
): Promise<void> => {
  try {
    const docRef = doc(db, COMPANY_COLLECTION, COMPANY_DOC_ID);
    
    const updateData: any = {
      companyPIN: details.companyPIN,
      companyName: details.companyName,
      address: details.address,
      mobile: details.mobile,
      email: details.email,
      updatedAt: Timestamp.now()
    };
    
    if (updatedBy) {
      updateData.updatedBy = updatedBy;
    }
    
    await setDoc(docRef, updateData, { merge: true });
    
    console.log('Company details updated successfully:', updateData);
  } catch (error) {
    console.error('Error updating company details:', error);
    throw error;
  }
};

// Subscribe to real-time updates
export const subscribeToCompanyDetails = (
  onUpdate: (details: CompanyDetails) => void,
  onError?: (error: Error) => void
) => {
  const docRef = doc(db, COMPANY_COLLECTION, COMPANY_DOC_ID);
  
  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = convertTimestamps(docSnap.data());
        onUpdate({
          ...data,
          id: docSnap.id
        } as CompanyDetails);
      } else {
        // Initialize with default if doesn't exist
        getCompanyDetails().then(onUpdate).catch(err => {
          console.error('Error initializing company details:', err);
          if (onError) onError(err);
        });
      }
    },
    (error) => {
      console.error('Error in company details subscription:', error);
      if (onError) onError(error);
    }
  );
};
