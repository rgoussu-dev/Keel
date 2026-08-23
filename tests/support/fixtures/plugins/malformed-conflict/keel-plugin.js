/** Fixture: a plugin declaring a rule `validateConflict` refuses. */
export default {
  name: 'acme-malformed',
  verticals: [
    {
      id: 'acme-malformed',
      description: 'Declares a rule with an empty `when`.',
      dimensions: [],
      adapters: [],
      conflicts: [{ id: 'acme/everything', when: [], reason: 'forbids every assembly' }],
    },
  ],
};
