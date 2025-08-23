import React from "react";
import HybeHeader from "@/components/HybeHeader";
import HybeFooter from "@/components/HybeFooter";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <HybeHeader />
      <main className="flex-grow">{children}</main>
      <HybeFooter />
    </div>
  );
};

export default Layout;
