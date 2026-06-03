import { 
  collection, 
  doc, 
  getDocs, 
  query, 
  where,
  addDoc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { User, SystemRole, UserPermissions } from '../types';
import { logLogin, logLogout, logError } from './activityLogService';

const USERS_COLLECTION = 'users';
const SESSION_KEY = 'recycle_manager_session';

// Helper function to get role-based permissions
export const getRolePermissions = (role: SystemRole): UserPermissions => {
  switch (role) {
    case 'admin':
      return {
        // Admin - Complete system access
        canManageUsers: true,
        canConfigureSystem: true,
        canViewFinancialReports: true,
        canGenerateReports: true,
        canMonitorOperations: true,
        canReviewReports: true,
        canApproveActivities: true,
        canOverseeStaff: true,
        canTrackPerformance: true,
        canEnterMaterialReceipt: true,
        canRecordProcessingStages: true,
        canUpdateInventory: true,
        canRecordExpenses: true,
        canUploadDocuments: true,
        canViewShipments: true,
        canViewInventory: true,
        canViewDashboard: true,
      };
    
    case 'manager':
      return {
        // Manager/Supervisor - Monitor and oversee
        canMonitorOperations: true,
        canReviewReports: true,
        canApproveActivities: true,
        canOverseeStaff: true,
        canTrackPerformance: true,
        canViewFinancialReports: true,
        canGenerateReports: true,
        canViewShipments: true,
        canViewInventory: true,
        canViewDashboard: true,
        // Can view but not modify user management
        canManageUsers: false,
        canConfigureSystem: false,
        // Cannot perform operational tasks
        canEnterMaterialReceipt: false,
        canRecordProcessingStages: false,
        canUpdateInventory: false,
        canRecordExpenses: false,
        canUploadDocuments: false,
      };
    
    case 'operator':
      return {
        // Operator/Staff - Operational tasks only
        canEnterMaterialReceipt: true,
        canRecordProcessingStages: true,
        canUpdateInventory: true,
        canRecordExpenses: true,
        canUploadDocuments: true,
        canViewShipments: true,
        canViewInventory: true,
        canViewDashboard: true,
        // Cannot manage or oversee
        canManageUsers: false,
        canConfigureSystem: false,
        canViewFinancialReports: false,
        canGenerateReports: false,
        canMonitorOperations: false,
        canReviewReports: false,
        canApproveActivities: false,
        canOverseeStaff: false,
        canTrackPerformance: false,
      };
    
    default:
      return {
        canViewShipments: true,
        canViewInventory: true,
        canViewDashboard: true,
      };
  }
};

// Login function
export const login = async (loginId: string, password: string): Promise<User> => {
  try {
    console.log('Attempting login for:', loginId);
    
    // Query Firestore for user with matching loginId
    const usersRef = collection(db, USERS_COLLECTION);
    const q = query(usersRef, where('loginId', '==', loginId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('Invalid login credentials');
    }
    
    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data() as User;
    
    // Check password (in production, use proper hashing comparison)
    if (userData.password !== password) {
      throw new Error('Invalid login credentials');
    }
    
    // Check if user is active
    if (!userData.isActive) {
      throw new Error('User account is inactive. Please contact administrator.');
    }
    
    // Update last login timestamp
    await updateDoc(doc(db, USERS_COLLECTION, userDoc.id), {
      lastLogin: new Date().toISOString()
    });
    
    // Create session
    const user: User = {
      ...userData,
      id: userDoc.id,
      lastLogin: new Date().toISOString()
    };
    
    // Store session in localStorage
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    
    // Log login activity
    await logLogin(user.id, user.fullName, user.role);
    
    console.log('Login successful for user:', user.fullName);
    return user;
  } catch (error: any) {
    console.error('Login error:', error);
    
    // Log failed login attempt
    try {
      await logError(
        loginId,
        loginId,
        'operator', // Default role for failed attempts
        'login',
        'authentication',
        `Failed login attempt for user: ${loginId}`,
        error.message || 'Invalid credentials'
      );
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    throw new Error(error.message || 'Login failed. Please try again.');
  }
};

// Logout function
export const logout = async (): Promise<void> => {
  const user = getCurrentUser();
  if (user) {
    try {
      await logLogout(user.id, user.fullName, user.role);
    } catch (error) {
      console.error('Failed to log logout:', error);
    }
  }
  localStorage.removeItem(SESSION_KEY);
  console.log('User logged out');
};

// Get current session
export const getCurrentUser = (): User | null => {
  try {
    const sessionData = localStorage.getItem(SESSION_KEY);
    if (!sessionData) return null;
    
    const user = JSON.parse(sessionData) as User;
    return user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  return getCurrentUser() !== null;
};

// Check if user has specific permission
export const hasPermission = (permission: keyof UserPermissions): boolean => {
  const user = getCurrentUser();
  if (!user) return false;
  
  return user.permissions[permission] === true;
};

// Create new user (Admin only)
export const createUser = async (userData: Omit<User, 'id' | 'createdAt' | 'permissions'>): Promise<User> => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser || !hasPermission('canManageUsers')) {
      throw new Error('Unauthorized: Only administrators can create users');
    }
    
    // Check if loginId already exists
    const usersRef = collection(db, USERS_COLLECTION);
    const q = query(usersRef, where('loginId', '==', userData.loginId));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      throw new Error('Login ID already exists. Please choose a different one.');
    }
    
    // Get permissions based on role
    const permissions = getRolePermissions(userData.role);
    
    const newUser = {
      ...userData,
      permissions,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.id,
      isActive: true
    };
    
    const docRef = await addDoc(collection(db, USERS_COLLECTION), newUser);
    
    console.log('User created successfully:', docRef.id);
    return {
      ...newUser,
      id: docRef.id
    };
  } catch (error: any) {
    console.error('Error creating user:', error);
    throw new Error(error.message || 'Failed to create user');
  }
};

// Update user (Admin only)
export const updateUser = async (userId: string, userData: Partial<Omit<User, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser || !hasPermission('canManageUsers')) {
      throw new Error('Unauthorized: Only administrators can update users');
    }
    
    // If role is being updated, update permissions accordingly
    if (userData.role) {
      userData.permissions = getRolePermissions(userData.role);
    }
    
    await updateDoc(doc(db, USERS_COLLECTION, userId), userData);
    console.log('User updated successfully:', userId);
  } catch (error: any) {
    console.error('Error updating user:', error);
    throw new Error(error.message || 'Failed to update user');
  }
};

// Delete user (Admin only)
export const deleteUser = async (userId: string): Promise<void> => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser || !hasPermission('canManageUsers')) {
      throw new Error('Unauthorized: Only administrators can delete users');
    }
    
    // Prevent deleting yourself
    if (userId === currentUser.id) {
      throw new Error('You cannot delete your own account');
    }
    
    await deleteDoc(doc(db, USERS_COLLECTION, userId));
    console.log('User deleted successfully:', userId);
  } catch (error: any) {
    console.error('Error deleting user:', error);
    throw new Error(error.message || 'Failed to delete user');
  }
};

// Get all users (Admin only)
export const getAllUsers = async (): Promise<User[]> => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser || !hasPermission('canManageUsers')) {
      throw new Error('Unauthorized: Only administrators can view all users');
    }
    
    const querySnapshot = await getDocs(collection(db, USERS_COLLECTION));
    const users: User[] = [];
    
    querySnapshot.forEach((doc) => {
      users.push({
        id: doc.id,
        ...doc.data()
      } as User);
    });
    
    console.log('Retrieved users:', users.length);
    return users;
  } catch (error: any) {
    console.error('Error getting users:', error);
    throw new Error(error.message || 'Failed to retrieve users');
  }
};

// Seed initial users (for development/setup)
// Ensures the admin user exists
export const seedMockUsers = async (): Promise<void> => {
  try {
    console.log('Ensuring admin user exists...');
    
    const adminUser = {
      loginId: 'admin.sample',
      password: 'admin@1234', // In production, this should be hashed
      fullName: 'System Administrator',
      email: 'admin@sample.local',
      role: 'admin' as SystemRole,
      isActive: true,
      permissions: getRolePermissions('admin'),
      createdAt: new Date().toISOString()
    };
    
    const usersRef = collection(db, USERS_COLLECTION);
    
    // Check if admin user exists and create if missing
    const q = query(usersRef, where('loginId', '==', adminUser.loginId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      // User doesn't exist, create it
      await addDoc(usersRef, adminUser);
      console.log(`Created admin user: ${adminUser.fullName} (${adminUser.loginId})`);
    } else {
      console.log(`Admin user already exists: ${adminUser.loginId}`);
    }
    
    console.log('Admin user verification completed!');
  } catch (error) {
    console.error('Error ensuring admin user:', error);
    throw error;
  }
};

// Force seed users (ignores existing users check - for testing/reset)
export const forceSeedMockUsers = async (): Promise<void> => {
  try {
    console.log('Force seeding admin user...');
    
    const adminUser = {
      loginId: 'admin.sample',
      password: 'admin@1234',
      fullName: 'System Administrator',
      email: 'admin@sample.local',
      role: 'admin' as SystemRole,
      isActive: true,
      permissions: getRolePermissions('admin'),
      createdAt: new Date().toISOString()
    };
    
    // Delete existing admin user first
    const usersRef = collection(db, USERS_COLLECTION);
    const q = query(usersRef, where('loginId', '==', adminUser.loginId));
    const querySnapshot = await getDocs(q);
    
    for (const docSnapshot of querySnapshot.docs) {
      await deleteDoc(doc(db, USERS_COLLECTION, docSnapshot.id));
      console.log(`Deleted existing user: ${adminUser.loginId}`);
    }
    
    // Create new admin user
    await addDoc(collection(db, USERS_COLLECTION), adminUser);
    console.log(`Created user: ${adminUser.fullName} (${adminUser.loginId})`);
    
    console.log('Admin user force seeded successfully!');
  } catch (error) {
    console.error('Error force seeding admin user:', error);
    throw error;
  }
};
