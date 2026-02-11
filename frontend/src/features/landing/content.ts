export const landingCopy = {
  brand: {
    logoText: "camOS",
    tagline: "Intelligence for Everyone",
  },
  nav: {
    anchors: [
      { href: "#what-you-get", label: "What you get" },
      { href: "#how-it-works", label: "How it works" },
      { href: "#system", label: "System" },
    ],
    actions: {
      demo: "Try Live Demo",
      signUp: "Sign Up",
      login: "Login",
    },
  },
  hero: {
    headline: "Real-time reporting from your existing CCTV.",
    supportLine: "See what’s happening across your locations—when you are away.",
  },
  whatYouGet: {
    heading: "What you get",
    bullets: [
      "Footfall and occupancy",
      "Site flow and peak times",
      "Dwell time",
      "Customer profile",
    ],
  },
  howItWorks: {
    heading: "How it works",
    steps: [
      "Sign Up — Add your location details.",
      "Survey — We match reporting to your camera setup.",
      "Live — Your system goes live. Real-time reporting.",
    ],
  },
  system: {
    heading: "System",
    bullets: [
      "Uses existing CCTV",
      "No additional hardware",
      "Consistent reporting",
    ],
    note: "Sign up at no cost.",
  },
  signUp: {
    heading: "Sign Up",
    line: "Create an account to start setup.",
    button: "Sign Up",
  },
  footer: {
    legalLine1:
      "Camera Operating Systems Limited is registered in England and Wales. Registered number: 16937639",
    legalLine2: "Registered address: 71-75 Shelton St, London WC2H 9JQ, UK",
    links: ["Privacy", "Terms", "Contact", "Login"],
  },
} as const;
