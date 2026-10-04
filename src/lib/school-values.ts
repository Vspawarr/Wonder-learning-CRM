// Form values for a school's details, shared by server pages and the client-side form (R35).

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export type SchoolValues = {
  schoolName: string;
  contactName: string;
  designation: string;
  mobile: string;
  email: string;
  state: string;
  city: string;
  area: string;
  address: string;
  currentCurriculum: string;
  studentStrength: string;
  branches: string;
};

/** Form values from a lead / client record. */
export function schoolValues(r: {
  schoolName: string;
  contactName: string;
  designation?: string | null;
  mobile: string;
  email?: string | null;
  state: string;
  city: string;
  area?: string | null;
  address?: string | null;
  currentCurriculum?: string | null;
  studentStrength?: number | null;
  branches?: number | null;
}): SchoolValues {
  return {
    schoolName: r.schoolName,
    contactName: r.contactName,
    designation: s(r.designation),
    mobile: r.mobile,
    email: s(r.email),
    state: r.state,
    city: r.city,
    area: s(r.area),
    address: s(r.address),
    currentCurriculum: s(r.currentCurriculum),
    studentStrength: s(r.studentStrength),
    branches: s(r.branches),
  };
}
