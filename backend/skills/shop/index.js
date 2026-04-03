export default function registerShop(scheduler) {
  scheduler.register({
    name: "shop",
    priority: 2,

    execute: async (context) => {
      const { action, payload } = context;

      try {
        switch (action) {

          case "gift":
            return giftItem(payload.id);

          case "getState":
            return readJSON(statePath);

          default:
            return null;
        }

      } catch (err) {
        console.error("Shop Skill Error:", err.message);
        return { error: err.message };
      }
    }
  });
}