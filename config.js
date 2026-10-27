// Lobby TV settings and the offline copy of the slides.
//
// The board reads slides.json when it can. If that file does not load, it uses
// LOBBY.slides below. Keep the two the same when you change the words.
//
// reviewUrl: leave this as an empty string until you have the real review link.
// The "Leave us a review" slide stays off while it is blank.
// Phone is the number on the last slide.
window.LOBBY = {
  slideSeconds: 11,
  reloadHours: 6,
  phone: "(781) 974-5239",
  reviewUrl: "",
  timezone: "America/New_York",
  weather: {
    latitude: 42.16,
    longitude: -70.79,
    place: "Norwell"
  },
  slides: {
    welcome: {
      line1: "WELCOME TO",
      line2: "3R PLUMBING & MECHANICAL",
      tagline: "People | Service | Solutions"
    },
    services: {
      title: "What we do",
      items: [
        {
          icon: "heating",
          title: "Heating",
          points: ["Boilers", "Furnaces", "Heat pumps"]
        },
        {
          icon: "cooling",
          title: "Cooling",
          points: ["AC", "Ductless"]
        },
        {
          icon: "plumbing",
          title: "Plumbing",
          points: ["Water heaters", "Repairs", "Drains"]
        },
        {
          icon: "plans",
          title: "Maintenance plans",
          points: []
        }
      ]
    },
    towns: {
      title: "Proudly serving the South Shore",
      home: ["Norwell", "Pembroke"],
      places: [
        "Norwell",
        "Pembroke",
        "Hanover",
        "Scituate",
        "Duxbury",
        "Marshfield",
        "Hingham",
        "Hanson",
        "Rockland",
        "Kingston"
      ]
    },
    reviewAsk: {
      title: "Leave us a review",
      hint: "Scan the code to share your experience"
    },
    cta: {
      title: "Questions? Ask us today"
    }
  }
};
