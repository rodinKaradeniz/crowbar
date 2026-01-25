import { AuthInfo } from "@/types";

export const mockAuth: AuthInfo[] = [
  // Customer auth
  {
    userId: "customer-1",
    email: "john.doe@example.com",
    password: "password123",
    type: "customer",
  },
  {
    userId: "customer-2",
    email: "jane.smith@example.com",
    password: "password123",
    type: "customer",
  },
  // Staff auth
  {
    userId: "staff-1",
    email: "manager@ironhorse.com",
    password: "password123",
    type: "staff",
  },
  {
    userId: "staff-2",
    email: "owner@rooftoplounge.com",
    password: "password123",
    type: "staff",
  },
];
