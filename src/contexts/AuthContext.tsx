import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserPermissions } from '../types';
import { 
  login as authLogin, 
  logout as authLogout, 
  getCurrentUser,
  hasPermission as checkPermission
} from '../services/authService';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (loginId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: keyof UserPermissions) => boolean;
  isAdmin: boolean;
  isManager: boolean;
  isOperator: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
    setIsLoading(false);
  }, []);

  const login = async (loginId: string, password: string) => {
    try {
      const loggedInUser = await authLogin(loginId, password);
      setUser(loggedInUser);
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    await authLogout();
    setUser(null);
  };

  const hasPermission = (permission: keyof UserPermissions): boolean => {
    return checkPermission(permission);
  };

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    logout,
    hasPermission,
    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'manager',
    isOperator: user?.role === 'operator',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
