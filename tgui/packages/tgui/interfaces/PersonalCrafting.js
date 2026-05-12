import { useBackend, useLocalState } from '../backend';
import {
  Button,
  Dimmer,
  Flex,
  Icon,
  Input,
  LabeledList,
  Section,
  Tabs,
} from '../components';
import { Window } from '../layouts';

let searchTimer = null;

export const PersonalCrafting = (props, context) => {
  const { act, data } = useBackend(context);
  const {
    busy,
    display_craftable_only,
    display_compact,
  } = data;

  // State: search query, selected tab, and whether we've sent the initial
  // category request to fill craftability.
  const [searchQuery, setSearchQuery] = useLocalState(context, 'craftingSearch', '');
  const [tab, setTab] = useLocalState(context, 'craftingTab', '');
  const [initialized, setInitialized] = useLocalState(context, 'craftingInit', false);

  // Flatten recipes and categories (identical to original)
  const crafting_recipes = data.crafting_recipes || {};
  const categories = [];
  const recipes = [];
  for (let category of Object.keys(crafting_recipes)) {
    const subcategories = crafting_recipes[category];
    if ('has_subcats' in subcategories) {
      for (let subcategory of Object.keys(subcategories)) {
        if (subcategory === 'has_subcats') continue;
        categories.push({ name: subcategory, category, subcategory });
        const _recipes = subcategories[subcategory];
        for (let recipe of _recipes) {
          recipes.push({ ...recipe, category: subcategory });
        }
      }
      continue;
    }
    categories.push({ name: category, category });
    const _recipes = crafting_recipes[category];
    for (let recipe of _recipes) {
      recipes.push({ ...recipe, category });
    }
  }

  // On first render, set a default tab and request the server to send
  // craftability for that category. This makes the buttons accurate.
  if (!initialized && categories.length > 0) {
    setInitialized(true);
    if (!tab) {
      const firstCat = categories[0];
      setTab(firstCat.name);
      act('set_category', {
        category: firstCat.category,
        subcategory: firstCat.subcategory,
      });
    }
  }

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  // Search results – always show all matches, ignoring the "Craftable Only"
  // toggle because the server hasn't sent craftability data for other
  // categories.
  const nameMatches = isSearching
    ? recipes.filter(r => r.name?.toLowerCase().includes(query))
    : [];
  const ingredientMatches = isSearching
    ? recipes.filter(r => r.req_text?.toLowerCase().includes(query))
    : [];

  // When not searching, show the current category's recipes.
  const shownRecipes = isSearching
    ? []
    : recipes.filter(recipe => recipe.category === tab);

  return (
    <Window title="Crafting Menu" width={700} height={800}>
      <Window.Content overflow="auto">
        {!!busy && (
          <Dimmer fontSize="32px">
            <Icon name="cog" spin={1} />
            {' Crafting...'}
          </Dimmer>
        )}

        <Section>
          {/* ---- Header: title, search bar, clear button, toggles ---- */}
          <Flex align="center" justify="space-between" mb={1}>
            <Flex.Item>
              <b>Personal Crafting</b>
            </Flex.Item>
            <Flex.Item grow={1} mx={2}>
              <Flex align="center">
                <Flex.Item grow={1}>
                  <Input
                    fluid
                    placeholder="Search..."
                    value={searchQuery}
                    onInput={(e, value) => {
                      setSearchQuery(value);
                      if (searchTimer) clearTimeout(searchTimer);
                      searchTimer = setTimeout(() => {
                        act('search', { query: value });
                      }, 200);
                    }}
                  />
                </Flex.Item>
                <Flex.Item ml={0.5}>
                  <Button
                    icon="times"
                    disabled={!searchQuery}
                    color="transparent"
                    onClick={() => {
                      setSearchQuery('');
                      if (searchTimer) clearTimeout(searchTimer);
                      act('search', { query: '' });
                    }}
                    tooltip="Clear search"
                  />
                </Flex.Item>
              </Flex>
            </Flex.Item>
            <Flex.Item>
              <Button.Checkbox
                content="Compact"
                checked={display_compact}
                onClick={() => act('toggle_compact')}
              />
              <Button.Checkbox
                content="Craftable Only"
                checked={display_craftable_only}
                onClick={() => act('toggle_recipes')}
              />
            </Flex.Item>
          </Flex>

          {/* ---- Content area: categories (hidden when searching) ---- */}
          <Flex.Item style={{ display: isSearching ? 'none' : 'block' }}>
            <Flex>
              <Flex.Item>
                <Tabs vertical>
                  {categories.map(category => (
                    <Tabs.Tab
                      key={category.name}
                      selected={category.name === tab}
                      onClick={() => {
                        setTab(category.name);
                        act('set_category', {
                          category: category.category,
                          subcategory: category.subcategory,
                        });
                      }}>
                      {category.name}
                    </Tabs.Tab>
                  ))}
                </Tabs>
              </Flex.Item>
              <Flex.Item grow={1} basis={0}>
                <CraftingList
                  craftables={shownRecipes}
                  ignoreCraftableFilter={false}
                />
              </Flex.Item>
            </Flex>
          </Flex.Item>

          {/* ---- Search results (visible only when searching) ---- */}
          <Flex.Item style={{ display: isSearching ? 'block' : 'none' }}>
            <Flex direction="column">
              <Flex.Item>
                <Section
                  title={`Name matches (${nameMatches.length})`}
                  level={2}
                >
                  <CraftingList
                    craftables={nameMatches}
                    ignoreCraftableFilter={false}
                  />
                </Section>
              </Flex.Item>
              <Flex.Item>
                <Section
                  title={`Ingredient matches (${ingredientMatches.length})`}
                  level={2}
                >
                  <CraftingList
                    craftables={ingredientMatches}
                    ignoreCraftableFilter={false}
                  />
                </Section>
              </Flex.Item>
            </Flex>
          </Flex.Item>
        </Section>
      </Window.Content>
    </Window>
  );
};

// ----------------------------------------------------------------
// CraftingList – now accepts an extra prop `ignoreCraftableFilter`.
// Uses `craftable.ref` as React key, which is guaranteed unique.
// ----------------------------------------------------------------
const CraftingList = (props, context) => {
  const { craftables = [], ignoreCraftableFilter } = props;
  const { act, data } = useBackend(context);
  const { craftability = {}, display_compact, display_craftable_only } = data;

  return craftables.map(craftable => {
    // If we're in "ignore craftable filter" mode (search results),
    // we never hide items. Otherwise, respect the toggle.
    const hidden = !ignoreCraftableFilter
      && display_craftable_only
      && !craftability[craftable.ref];
    if (hidden) return null;

    const canCraft = craftability[craftable.ref];
    if (display_compact) {
      return (
        <LabeledList.Item
          key={craftable.ref}
          label={craftable.name}
          className="candystripe"
          buttons={
            <Button
              icon="cog"
              content="Craft"
              disabled={!canCraft}
              tooltip={
                craftable.tool_text && 'Tools needed: ' + craftable.tool_text
              }
              tooltipPosition="left"
              onClick={() => act('make', { recipe: craftable.ref })}
            />
          }>
          {craftable.req_text}
        </LabeledList.Item>
      );
    }

    return (
      <Section
        key={craftable.ref}
        title={craftable.name}
        level={2}
        buttons={
          <Button
            icon="cog"
            content="Craft"
            disabled={!canCraft}
            onClick={() => act('make', { recipe: craftable.ref })}
          />
        }>
        <LabeledList>
          {!!craftable.req_text && (
            <LabeledList.Item label="Required">
              {craftable.req_text}
            </LabeledList.Item>
          )}
          {!!craftable.catalyst_text && (
            <LabeledList.Item label="Catalyst">
              {craftable.catalyst_text}
            </LabeledList.Item>
          )}
          {!!craftable.tool_text && (
            <LabeledList.Item label="Tools">
              {craftable.tool_text}
            </LabeledList.Item>
          )}
        </LabeledList>
      </Section>
    );
  });
};
