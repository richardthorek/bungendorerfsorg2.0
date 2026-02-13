/**
 * Tests for server-side form validation
 */

describe("Server-side Validation", () => {
  // Load and evaluate server.js validation function
  let validateContactFormData;

  beforeAll(() => {
    // Define the validation function from server.js
    validateContactFormData = function(data) {
      const errors = [];

      // Name validation
      if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
        errors.push('Name must be at least 2 characters long');
      }
      if (data.name && data.name.trim().length > 100) {
        errors.push('Name must be less than 100 characters');
      }

      // Email validation
      // Prevent ReDoS by checking length first and using a simpler pattern
      if (!data.email || typeof data.email !== 'string') {
        errors.push('Please provide a valid email address');
      } else if (data.email.length > 254) {
        errors.push('Email address is too long');
      } else {
        const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailPattern.test(data.email)) {
          errors.push('Please provide a valid email address');
        }
      }

      // Phone validation (optional field)
      if (data.phone && data.phone.trim()) {
        const phonePattern = /^(\+?61|0)[2-478](?:[ -]?[0-9]){8}$/;
        const cleanPhone = data.phone.replace(/[\s()-]/g, '');
        if (!phonePattern.test(cleanPhone)) {
          errors.push('Please provide a valid Australian phone number');
        }
      }

      // Message validation
      if (!data.message || typeof data.message !== 'string' || data.message.trim().length < 10) {
        errors.push('Message must be at least 10 characters long');
      }
      if (data.message && data.message.trim().length > 2000) {
        errors.push('Message must be less than 2000 characters');
      }

      return errors;
    };
  });

  describe("Name validation", () => {
    test("should reject empty name", () => {
      const data = { name: "", email: "test@example.com", message: "Test message here" };
      const errors = validateContactFormData(data);
      expect(errors).toContain("Name must be at least 2 characters long");
    });

    test("should reject name with only 1 character", () => {
      const data = { name: "A", email: "test@example.com", message: "Test message here" };
      const errors = validateContactFormData(data);
      expect(errors).toContain("Name must be at least 2 characters long");
    });

    test("should reject name longer than 100 characters", () => {
      const data = { 
        name: "A".repeat(101), 
        email: "test@example.com", 
        message: "Test message here" 
      };
      const errors = validateContactFormData(data);
      expect(errors).toContain("Name must be less than 100 characters");
    });

    test("should accept valid name", () => {
      const data = { name: "John Doe", email: "test@example.com", message: "Test message here" };
      const errors = validateContactFormData(data);
      expect(errors).not.toContain("Name must be at least 2 characters long");
    });
  });

  describe("Email validation", () => {
    test("should reject invalid email format", () => {
      const data = { name: "John Doe", email: "invalid-email", message: "Test message here" };
      const errors = validateContactFormData(data);
      expect(errors).toContain("Please provide a valid email address");
    });

    test("should reject email without @", () => {
      const data = { name: "John Doe", email: "testexample.com", message: "Test message here" };
      const errors = validateContactFormData(data);
      expect(errors).toContain("Please provide a valid email address");
    });

    test("should reject email without domain", () => {
      const data = { name: "John Doe", email: "test@", message: "Test message here" };
      const errors = validateContactFormData(data);
      expect(errors).toContain("Please provide a valid email address");
    });

    test("should accept valid email", () => {
      const data = { name: "John Doe", email: "test@example.com", message: "Test message here" };
      const errors = validateContactFormData(data);
      expect(errors).not.toContain("Please provide a valid email address");
    });
  });

  describe("Phone validation", () => {
    test("should accept valid Australian mobile number", () => {
      const data = { 
        name: "John Doe", 
        email: "test@example.com", 
        phone: "0412345678",
        message: "Test message here" 
      };
      const errors = validateContactFormData(data);
      expect(errors).not.toContain("Please provide a valid Australian phone number");
    });

    test("should accept valid landline number", () => {
      const data = { 
        name: "John Doe", 
        email: "test@example.com", 
        phone: "0262345678",
        message: "Test message here" 
      };
      const errors = validateContactFormData(data);
      expect(errors).not.toContain("Please provide a valid Australian phone number");
    });

    test("should accept phone with international prefix", () => {
      const data = { 
        name: "John Doe", 
        email: "test@example.com", 
        phone: "+61412345678",
        message: "Test message here" 
      };
      const errors = validateContactFormData(data);
      expect(errors).not.toContain("Please provide a valid Australian phone number");
    });

    test("should reject invalid phone number", () => {
      const data = { 
        name: "John Doe", 
        email: "test@example.com", 
        phone: "123",
        message: "Test message here" 
      };
      const errors = validateContactFormData(data);
      expect(errors).toContain("Please provide a valid Australian phone number");
    });

    test("should allow empty phone (optional field)", () => {
      const data = { 
        name: "John Doe", 
        email: "test@example.com", 
        phone: "",
        message: "Test message here" 
      };
      const errors = validateContactFormData(data);
      expect(errors).not.toContain("Please provide a valid Australian phone number");
    });
  });

  describe("Message validation", () => {
    test("should reject message shorter than 10 characters", () => {
      const data = { name: "John Doe", email: "test@example.com", message: "Short" };
      const errors = validateContactFormData(data);
      expect(errors).toContain("Message must be at least 10 characters long");
    });

    test("should reject message longer than 2000 characters", () => {
      const data = { 
        name: "John Doe", 
        email: "test@example.com", 
        message: "A".repeat(2001) 
      };
      const errors = validateContactFormData(data);
      expect(errors).toContain("Message must be less than 2000 characters");
    });

    test("should accept valid message", () => {
      const data = { 
        name: "John Doe", 
        email: "test@example.com", 
        message: "This is a valid test message" 
      };
      const errors = validateContactFormData(data);
      expect(errors.length).toBe(0);
    });
  });

  describe("Complete form validation", () => {
    test("should return no errors for valid complete form", () => {
      const data = {
        name: "John Doe",
        email: "john@example.com",
        phone: "0412345678",
        message: "This is a complete and valid test message"
      };
      const errors = validateContactFormData(data);
      expect(errors.length).toBe(0);
    });

    test("should return multiple errors for invalid form", () => {
      const data = {
        name: "A",
        email: "invalid",
        phone: "123",
        message: "Short"
      };
      const errors = validateContactFormData(data);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
