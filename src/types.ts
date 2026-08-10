export type View = "dashboard" | "staff" | "terminals";
export type AppRole = "administrator" | "manager" | "viewer";

export type Profile = {
  id: string;
  display_name: string;
  role: AppRole;
};

export type Site = { id: string; code: string; name: string };

export type StaffMember = {
  id: string;
  site_id: string;
  staff_number: string;
  first_name: string;
  last_name: string;
  role_title: string | null;
  email: string | null;
  is_active: boolean;
};

export type Terminal = {
  id: string;
  site_id: string;
  terminal_number: number;
  name: string;
  location: string | null;
  terminal_type: string;
  is_active: boolean;
};
