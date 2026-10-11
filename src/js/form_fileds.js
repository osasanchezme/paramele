const auth_form_fields = {
    name: { default: "", type: "text", autocomplete: "name", validation: [{ type: "no", criteria: "", msg: "cannot_be_empty" }] },
    industry: {
      default: "",
      type: "dropdown",
      data: ["student", "teacher", "engineer", "architect", "other"],
      validation: [{ type: "no", criteria: "", msg: "cannot_be_empty" }],
    },
    company: {
      default: "",
      type: "text",
      autocomplete: "organization",
      validation: [{ type: "no", criteria: "", msg: "cannot_be_empty" }],
    },
    email: {
      default: "",
      type: "email",
      autocomplete: "email",
      validation: [
        { type: "no", criteria: "" },
        { type: "contains", criteria: "@", msg: "no_valid_email" },
        { type: "contains", criteria: ".", msg: "no_valid_email" },
      ],
    },
    password: {
      default: "",
      type: "password",
      autocomplete: "new-password",
      // Keep in sync with the password policy in Firebase Authentication > Settings
      validation: [
        { type: "no", criteria: "", msg: "cannot_be_empty" },
        { type: "min_length", criteria: 10, msg: "password_too_short" },
      ],
    },
    verify_password: {
      default: "",
      type: "password",
      autocomplete: "new-password",
      validation: [{ type: "equal_key", criteria: "password", msg: "passwords_no_match" }],
    },
  };

  const log_in_form_fields = {
    email: {
      default: "",
      type: "email",
      autocomplete: "username",
      validation: [
        { type: "no", criteria: "" },
        { type: "contains", criteria: "@", msg: "no_valid_email" },
        { type: "contains", criteria: ".", msg: "no_valid_email" },
      ],
    },
    password: {
      default: "",
      type: "password",
      autocomplete: "current-password",
      validation: [{ type: "no", criteria: "", msg: "cannot_be_empty" }],
    },
  };

  export {auth_form_fields, log_in_form_fields};