import { 
  collection, 
  onSnapshot, 
  query,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { User } from '../types';

const USERS_COLLECTION = 'users';

/**
 * Subscribe to real-time updates for all users
 */
export const subscribeToUsers = (
  onUpdate: (users: User[]) => void,
  onError: (error: Error) => void
): Unsubscribe => {
  try {
    const usersQuery = query(collection(db, USERS_COLLECTION));
    
    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const users: User[] = [];
        snapshot.forEach((doc) => {
          users.push({
            id: doc.id,
            ...doc.data()
          } as User);
        });
        
        // Sort by role: admin > manager > operator, then by fullName
        users.sort((a, b) => {
          const roleOrder = { admin: 1, manager: 2, operator: 3 };
          const roleCompare = roleOrder[a.role] - roleOrder[b.role];
          if (roleCompare !== 0) return roleCompare;
          return a.fullName.localeCompare(b.fullName);
        });
        
        console.log('Users subscription update:', users.length, 'users');
        onUpdate(users);
      },
      (error) => {
        console.error('Error in users subscription:', error);
        onError(error as Error);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up users subscription:', error);
    onError(error as Error);
    return () => {}; // Return empty unsubscribe function
  }
};

/**
 * Generate a unique login ID
 */
export const generateLoginId = (role: 'admin' | 'manager' | 'operator', existingUsers: User[]): string => {
  const prefix = role === 'admin' ? 'admin' : role === 'manager' ? 'mgr' : 'opr';
  
  // Find highest number for this role
  const roleUsers = existingUsers.filter(u => u.loginId.startsWith(prefix));
  const numbers = roleUsers.map(u => {
    const match = u.loginId.match(/\d+$/);
    return match ? parseInt(match[0]) : 0;
  });
  
  const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `${prefix}${String(nextNumber).padStart(3, '0')}`;
};

/**
 * Generate a random password
 */
export const generatePassword = (length: number = 8): string => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  
  // Ensure at least one uppercase, one lowercase, one number
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
  password += '0123456789'[Math.floor(Math.random() * 10)];
  
  // Fill the rest randomly
  for (let i = 3; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

/**
 * Get role display name
 */
export const getRoleDisplayName = (role: 'admin' | 'manager' | 'operator'): string => {
  switch (role) {
    case 'admin':
      return 'Administrator';
    case 'manager':
      return 'Manager/Supervisor';
    case 'operator':
      return 'Operator/Staff';
    default:
      return role;
  }
};

/**
 * Get role color for UI
 */
export const getRoleColor = (role: 'admin' | 'manager' | 'operator'): { bg: string; text: string } => {
  switch (role) {
    case 'admin':
      return { bg: 'bg-purple-100', text: 'text-purple-800' };
    case 'manager':
      return { bg: 'bg-blue-100', text: 'text-blue-800' };
    case 'operator':
      return { bg: 'bg-green-100', text: 'text-green-800' };
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-800' };
  }
};
