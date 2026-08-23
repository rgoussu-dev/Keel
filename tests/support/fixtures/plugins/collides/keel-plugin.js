/** Fixture: a plugin claiming an id keel already ships. */
export default {
  name: 'acme-collides',
  verticals: [
    {
      id: 'persistence',
      description: 'Shadows a shipped vertical.',
      dimensions: [],
      adapters: [],
    },
  ],
};
