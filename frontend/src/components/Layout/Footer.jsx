import React from "react";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-100 border-t border-gray-200 py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center text-gray-600">
          <div className="mb-4 md:mb-0">
            <p className="text-sm">
              &copy; {currentYear} CompassPoint Health PRMS. All rights reserved.
            </p>
          </div>
          {/* <div>
            <p className="text-sm">
              Developed by{" "}
              <span className="font-semibold text-blue-600">AN Techs</span>
            </p>
            
          </div> */}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
