
window.APP_CONFIG = {
  SUPABASE_URL: "https://hlrvwrqeleukdhsjxyrm.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_FutmflxmMv9DkUDttdtjiw_CE9AQGla",
  ROOM_SLUG: "birthday-surprise",

  EVENT_TITLE: "Yara & Aboudi's Birthday!!!",
  EVENT_DATE: "2026-08-21T17:00:00+03:00",
  EVENT_LOCATION: "Open the Venue tab to choose the place for our birthdays ",
  CURRENCY: "USD",

  // keep this for demo so I can test without supabase
  DEMO_INVITE_CODE: "DEMO"
};

window.BIRTHDAY_ITEMS = [
  {
    id: "cheese-table",
    name: "Cheese",
    image: "assets/items/cheese.webp",
    imageAlt: "Cheese variety on a board",
    description: "Get at least 1 type of cheese for the charcuterie board (Specify what you are bringing as a note)",
    budget: 0,
    maxPeople: 11,
    shared: true,
    priority: 2
  },
  {
    id: "meats-table",
    name: "Meats",
    image: "assets/items/meat.webp",
    imageAlt: "Bunch of meats on a counter",
    description: "Get at least 1 type of meat charcuterie board (Specify what you are bringing as a note)",
    budget: 0,
    maxPeople: 11,
    shared: true,
    priority: 3
  },
  {
    id: "food-table",
    name: "S'mores",
    image: "assets/items/smores.webp",
    imageAlt: "Yummy S'more",
    description: "Marshmallows, chocolate, and biscuits(Specify which you are getting as a note)",
    budget: 120,
    maxPeople: 11,
    shared: true,
    priority: 5
  },
  {
    id: "drinks-ice",
    name: "Drinks and ice",
    image: "assets/items/drinks.webp",
    imageAlt: "A green party drink held against a dark background",
    description: "Vodka, whiskey, a few red wine bottles, and other drinks of choice + mixers and ice(Specify which you are getting as a note)",
    budget: 45,
    maxPeople: 11,
    shared: true,
    priority: 6
  },
  {
    id: "playlist-speaker",
    name: "Speakers",
    image: "assets/items/speakers.webp",
    imageAlt: "Record player needle resting on a vinyl record",
    description: "Music is a MUST so who can bring their speakers?",
    budget: 0,
    maxPeople: 11,
    shared: true,
    priority: 8
  },

];
