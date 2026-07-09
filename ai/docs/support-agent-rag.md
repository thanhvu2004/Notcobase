# Notcobase Support Agent RAG Guide

Purpose: this document is source material for a chat agent that helps signed-in Notcobase users use the product. The agent should answer practical "how do I..." questions about tables, records, users, permissions, roles, pages, and the visual UI editor.

Audience: end users and administrators using the Notcobase web UI.

Product summary: Notcobase is a low-code internal app builder. Users define data tables, add fields and records, manage access with users/roles/permissions, and create custom pages with a visual page builder that can render forms, tables, layout components, navigation buttons, and data fields.

## Agent Behavior

When answering users:

- Give short step-by-step UI instructions first.
- Mention required permissions when a feature may be hidden.
- Use Notcobase terms: table, field, record, page, editor mode, role, permission, FormBlock, TableBlock.
- If a user cannot see an action, first suspect missing permissions or disabled editor mode.
- Do not invent features. If a feature is not described here, say it may not be available in the current build.
- For destructive actions such as deleting tables, fields, records, users, roles, permissions, or pages, remind the user that Notcobase asks for confirmation and the action can affect data or access.

## Core Navigation

After login, the top navigation contains built-in areas and custom pages.

- Tables opens the table builder and record manager.
- The user/system menu can open Users and Permissions when the signed-in user has one of `users.view`, `roles.view`, or `permissions.view`.
- Custom low-code pages appear in the navigation when they are published, visible in the navbar, and the current user has the page's required permission.
- Users with `pages.editor` can toggle Editor mode in the header.
- In Editor mode, users can add pages or sections from the plus button in the navigation, reorder pages/sections by drag and drop, and edit the selected page.

If no custom pages are available and Editor mode is off, the app shows an empty state.

## Default Admin

The backend seeder creates an `Administrator` role with all seeded permissions and creates a default `admin` user with password `admin123` if that user does not already exist.

Support guidance: tell administrators to change the default password in real deployments and avoid sharing administrator credentials.

## Permissions Reference

Permissions are string names stored in roles and included in the signed-in user's token.

User and role permissions:

- `users.view`, `users.create`, `users.edit`, `users.delete`
- `roles.view`, `roles.create`, `roles.edit`, `roles.delete`
- `roles.assign`, `roles.remove`
- `permissions.view`, `permissions.create`, `permissions.edit`, `permissions.delete`
- `permissions.assign`, `permissions.remove`

Page permissions:

- `pages.view` allows users to view low-code page records.
- `pages.editor` allows users to create, edit, save, delete, and arrange low-code pages. Users with `pages.editor` can also load the permission list for page access settings.

Table, field, and record permissions:

- `tables.view`, `tables.create`, `tables.edit`, `tables.delete`
- `columns.view`, `columns.create`, `columns.edit`, `columns.delete`
- `records.view`, `records.create`, `records.edit`, `records.delete`

Common permission troubleshooting:

- If Tables is blocked, the user needs `tables.view`.
- If the create table button is missing, the user needs `tables.create`.
- If the field form is missing, the user needs `columns.create` or `columns.edit`.
- If add record is missing, the user needs `records.create`.
- If Editor mode is missing, the user needs `pages.editor`.
- If a custom page is hidden, check `showInNavbar`, `requiredPermission`, and whether the user has that permission.
- If the Users area is blocked, the user needs at least one of `users.view`, `roles.view`, or `permissions.view`.

## Tables: Create and Manage Tables

A table is a user-defined data model. Tables contain fields, and records store values for those fields.

To create a table:

1. Open Tables.
2. Select Create Table.
3. Enter a table name.
4. Optionally enter a description.
5. Optionally enable "inherit properties from another table" and choose a parent table.
6. Save.

To edit a table:

1. Open Tables.
2. Select the table from the table list.
3. Select Edit Table.
4. Change name, description, or inheritance settings.
5. Save.

To delete a table:

1. Open Tables.
2. Select the table.
3. Select Delete.
4. Confirm the prompt.

Important inheritance behavior:

- A table can inherit fields from a parent table.
- Inherited fields are shown in the child table but cannot be reordered, edited, or deleted from the child table.
- A parent table cannot be deleted while another table inherits from it.

## Fields: Types and Configuration

Fields are table columns. Supported field types:

- `text`: short text input.
- `longtext`: multi-line text.
- `url`: URL input.
- `number`: numeric input.
- `finance`: numeric input with decimal step.
- `date`: date input.
- `checkbox`: true/false value.
- `select`: choice list.
- `reference`: relationship to records in another table.
- `file`: file name input from an uploaded file selection.

To add a field:

1. Open Tables.
2. Select a table.
3. Use the Add Field form.
4. Enter the field name.
5. Choose a field type.
6. Mark Required if the record must include a value.
7. Configure type-specific settings if shown.
8. Save Field.

To edit a field:

1. Open Tables.
2. Select a table.
3. In the fields list, select Edit on the field.
4. Update the settings.
5. Save Field.

To reorder fields:

1. Open Tables.
2. Select a table.
3. Drag a non-inherited field in the fields list to a new position.

Select field configuration:

- Add options one at a time.
- Choose a default option with the radio button.
- Edit or remove existing options.

Reference field configuration:

- Choose a target table.
- Choose a relationship mode.
- Lookup mode stores selected record IDs from the target table.
- Related record mode also uses a parent link field on the target table.
- When related mode is selected, enter the parent link field name. The app may create or use a hidden parent-link field for related records.

## Records: Create, Edit, Delete, and View

Records are rows inside a table.

To create a record:

1. Open Tables.
2. Select a table.
3. Select Add Record.
4. Fill in the visible fields.
5. Save Record.

To edit a record:

1. Open Tables.
2. Select a table.
3. Double-click a row in the records grid.
4. Edit values.
5. Save Record.

To delete a record:

1. Open Tables.
2. Select a table.
3. Use Delete in the record grid actions.
4. Confirm the prompt.

Record input behavior:

- Checkbox fields store true/false and display as Yes or No.
- Reference fields accept comma-separated record IDs in the table admin form.
- Number and finance fields are saved as numbers.
- Empty optional values are omitted from the payload; required empty fields are still submitted for validation.

## Users, Roles, and Permissions

Notcobase uses role-based access control.

- Users can have multiple roles.
- Roles can have multiple permissions.
- Permissions control which UI areas and actions are available.

To create a user:

1. Open the user/system menu.
2. Open Users and Permissions.
3. In the Users tab, enter a username and password.
4. Select Create User.

To assign roles to a user:

1. Open Users and Permissions.
2. Open the Users tab.
3. Select a user from the user list.
4. Select an unassigned role from the role list.
5. Assigned roles appear as tags on the selected user.

To remove a role from a user:

1. Select the user.
2. Select the role tag marked with `x`.

To create a role:

1. Open Users and Permissions.
2. Open the Roles tab.
3. Enter a role name.
4. Select Create Role.

To assign permissions to a role:

1. Open Users and Permissions.
2. Open the Roles tab.
3. Select a role.
4. Check or uncheck permissions in the permission list.

To create a custom permission:

1. Open Users and Permissions.
2. Open the Permissions tab.
3. Enter the permission name.
4. Select Create Permission.

Custom permissions are useful for restricting pages. Create a permission, assign it to roles, then set a page's Required Permission to that permission.

## Pages and Editor Mode

Pages are low-code screens built from a JSON schema through the visual Page Builder.

To create a page:

1. Sign in as a user with `pages.editor`.
2. Turn on Editor mode.
3. Select the plus button in the navigation.
4. Choose to add a page or add a section.
5. Enter the page name.
6. The app opens the new page in Editor mode.

To edit page settings:

1. Turn on Editor mode.
2. Open the page.
3. Use the Page panel in the left sidebar.
4. Change page name, required permission, or show in navbar.
5. Select Save.

To restrict a page:

1. Create or identify a permission.
2. Assign that permission to roles that should access the page.
3. Open the page in Editor mode.
4. In the Page panel, set Required Permission.
5. Save.

To hide a page from navigation:

1. Open the page in Editor mode.
2. Uncheck Show in Navbar.
3. Save.

To delete a page:

1. Open the page in Editor mode.
2. Select Delete in the Page panel.
3. Confirm the prompt.

Page organization:

- Navigation sections group pages.
- In Editor mode, pages and sections can be dragged to reorder them.
- Pages can be dragged into sections.
- Removing a section removes the section grouping, not necessarily the pages.

## Page Builder Component Types

The Page Builder can add these components:

- Layout components: `Container`, `Section`, `Grid.Row`, `Grid.Col`, `Tabs`, `Divider`.
- Text and action components: `Heading`, `Text`, `Button`.
- Field components: `Input`, `InputNumber`, `Input.TextArea`, `Textarea`, `Select`, `Checkbox`, `Switch`, `DatePicker`, `File`, `Reference`.
- Data blocks: `FormBlock`, `TableBlock`.

General editing flow:

1. Turn on Editor mode.
2. Select a component on the canvas.
3. Use Add Component to insert a new component into the selected container.
4. Use Configure to edit the selected component's title, text, layout, field, data, or behavior settings.
5. Drag components on the canvas to move them before, after, or inside other components.
6. Use the small `x` delete button on a selected component to remove it. Deleting a FormBlock or TableBlock removes the whole block; deleting many other container components may promote their children.
7. Select Save in the Page panel.

## Layout Components

Container:

- Root page container.
- Supports layout properties such as vertical layout.

Section:

- Groups components.
- Supports vertical, horizontal, and grid layout.

Grid.Row:

- Creates a row with columns.
- Configure column count from 1 to 12.
- Configure horizontal gutter, vertical gutter, align, justify, and wrap.

Grid.Col:

- A column inside a grid row.
- Configure span, offset, order, flex, and responsive spans for `xs`, `sm`, `md`, `lg`, `xl`, and `xxl`.
- Span values use a 24-column grid.

Tabs:

- Contains tab sections.
- Configure tab position: top, left, right, or bottom.
- Add tabs and edit tab labels from the Configure panel.

Divider:

- Displays a divider with optional text.
- Configure text and orientation.

## Text, Heading, and Button Components

Heading, Text, and Button have a Text setting.

Button navigation:

1. Select a Button.
2. In Configure, set Action to Navigate to Page.
3. Choose Target Page.
4. Optionally provide query params JSON.
5. Save the page.

If the query params JSON is invalid, the editor shows a JSON error and does not apply that setting.

## Field Components

Field components can be placed inside forms or custom layouts. Common settings:

- Field Name maps the component to a record field.
- Placeholder is available for text-like fields.
- Required marks the field as required.
- Disabled prevents editing.
- Hidden in forms hides the field from generated forms.
- Visibility can show the field only when another field matches a condition.

Visibility rules:

- Select Visible When Field.
- Choose operator: equals, not equals, or contains.
- Enter the match value.
- Leave Visible When Field empty to always show the field.

Value generator:

- Available for `Input`, `Input.TextArea`, and `Textarea`.
- Enable Generate Value.
- Enter a template such as `INV-{YYYY}{MM}-{seq:6}`.
- Choose whether manual edits are allowed.
- Generated values run when creating records.

Static Select options:

- Choose static options.
- Enter one option per line.
- Blur the textarea or save after editing so options are synced.

Dynamic Select options:

- Choose dynamic options.
- Select a source table.
- Choose display column and value column.
- Optionally choose Depends On Field and Filter Field for dependent dropdown behavior.
- Empty Parent Placeholder is shown when a parent value is required first.

Reference field component:

- Select a target table.
- Choose display column, relationship mode, picker variant, and add-record action.
- Picker variant can be table or select.
- Add-record action can open a modal or navigate to another page.
- Related record mode requires a parent link field on the target table.

## FormBlock

A FormBlock creates or edits records for a selected table.

To add a form page:

1. Turn on Editor mode.
2. Add a FormBlock.
3. Select the FormBlock on the canvas.
4. In Configure, select the source table.
5. Choose Mode: Auto, Create, or Edit.
6. Select fields from Form Fields From Columns, or use Select All.
7. Configure submit label and after-save behavior.
8. Save the page.

FormBlock modes:

- Auto creates a record unless a record ID is available in the URL.
- Create always creates a new record.
- Edit edits the record identified by Record ID or Record ID Param.

Record ID settings:

- Record ID can be a fixed numeric record ID.
- Record ID Param defaults to `id` and reads the record ID from the page URL query string.

After-save actions:

- Stay on Page keeps the user on the form.
- Navigate to Page sends the user to a selected page.
- Navigate Back returns to the previous route in app navigation.

Shared form group:

- Enable Use Shared Form Group when multiple FormBlocks should submit together.
- Use the same Form Group Key on the blocks that should share values.
- Show Group Save Button controls whether the block displays the shared submit button.

Create/edit permissions inside FormBlock:

- Allow Create controls whether the block can create records.
- Allow Edit controls whether the block can edit records.
- The block is disabled in editor mode.

## TableBlock

A TableBlock displays records from a selected table.

To add a records table to a page:

1. Turn on Editor mode.
2. Add a TableBlock.
3. Select the TableBlock.
4. Choose the table.
5. Select visible columns from Table Columns, or use Select All.
6. Configure page size and row/create/edit behavior.
7. Save the page.

TableBlock settings:

- Page Size controls grid pagination.
- Row Click can do nothing or navigate to another page.
- Row Target Page chooses where row click navigates.
- Row Mode sets view or edit when navigating.
- Row Query Params JSON adds parameters during row navigation.
- Create Action opens a modal or navigates to a create page.
- Edit Action can navigate to an edit page.
- Create/Edit query params JSON adds extra navigation parameters.
- Allow Create shows or hides the New button.
- Allow Edit shows or hides Edit actions.
- Allow Delete shows a Delete action if enabled. In the current renderer, delete behavior may be incomplete for custom page TableBlock actions.

Typical list-to-edit workflow:

1. Create a list page with a TableBlock.
2. Create an edit page with a FormBlock in Auto or Edit mode.
3. In the TableBlock, set Row Click or Edit Action to Navigate to Page.
4. Choose the edit page.
5. Ensure the navigation params include `id` or use the built-in row navigation behavior, which passes `id`, `recordId`, `tableId`, and `mode`.
6. In the FormBlock, keep Record ID Param as `id`.

Typical create workflow:

1. Create a list page with a TableBlock.
2. Create a create page with a FormBlock in Create mode.
3. In the TableBlock, set Create Action to Navigate to Page.
4. Choose the create page.
5. Save both pages.

## References and Related Records

Lookup reference:

- Use when one field should store selected records from another table.
- Target records are selected by ID in table admin or by the Reference component picker in page forms.

Related record reference:

- Use when child records belong to a parent record.
- Requires a parent link field on the target table.
- When creating a parent record with related child drafts in a FormBlock, Notcobase creates the parent first, then creates related child records with the parent ID.

Support guidance:

- If related records do not appear, check that the parent record has been saved and that the parent link field name matches the reference configuration.
- If a reference picker is empty, check target table records and `records.view`/`columns.view` permissions.

## Common Answers

Question: Why can I not see Editor mode?

Answer: Editor mode only appears for users with `pages.editor`. Ask an administrator to add that permission to one of your roles.

Question: Why can I see a page in Editor mode but another user cannot?

Answer: The page may require a permission that the other user does not have, or Show in Navbar may be off. Check the page's Required Permission and Show in Navbar settings in Editor mode.

Question: How do I make a page only visible to managers?

Answer: Create a permission such as `pages.manager`, assign it to the Manager role, open the page in Editor mode, set Required Permission to `pages.manager`, and save.

Question: How do I create a table with shared fields?

Answer: Create the parent table with the shared fields. Then create a child table, enable inherit properties from another table, and select the parent. The child table will show inherited fields plus its own fields.

Question: How do I build a list page and an edit page?

Answer: Create an edit page with a FormBlock pointed at the table and Record ID Param set to `id`. Create a list page with a TableBlock pointed at the same table. Set row click or edit action to navigate to the edit page. Save both pages.

Question: Why is Add Record disabled?

Answer: Add Record can be disabled when the table has no visible form fields. It can also be hidden if the user lacks `records.create`.

Question: Why is a field marked hidden?

Answer: Fields can be hidden from forms through `hiddenInForms`, and related reference parent-link fields may be hidden automatically. Hidden fields are not shown in normal record forms.

Question: How do I create a dropdown from another table?

Answer: Add or select a Select field component, choose Dynamic Options, select the source table, then choose the display column and value column. Optionally configure Depends On Field and Filter Field for dependent dropdowns.

Question: How do I troubleshoot "access denied"?

Answer: Check the user's roles, check the permissions assigned to those roles, then compare those permissions with the action they are trying to perform. Built-in app areas and custom pages both depend on permission strings.

## API Context for Advanced Support

The UI talks to these backend routes:

- Auth: `POST /api/auth/register`, `POST /api/auth/login`.
- Tables: `GET /api/tables`, `GET /api/tables/{id}`, `POST /api/tables`, `PUT /api/tables/{id}`, `DELETE /api/tables/{id}`.
- Columns: `GET /api/tables/{tableId}/columns`, `POST /api/tables/{tableId}/columns`, `PUT /api/tables/{tableId}/columns/reorder`, `PUT /api/tables/{tableId}/columns/{columnId}`, `DELETE /api/tables/{tableId}/columns/{columnId}`.
- Records: `GET /api/tables/{tableId}/records`, `GET /api/tables/{tableId}/records/{recordId}`, `POST /api/tables/{tableId}/records`, `PUT /api/tables/{tableId}/records/{recordId}`, `DELETE /api/tables/{tableId}/records/{recordId}`, `POST /api/tables/{tableId}/records/bulk-delete`.
- Users: `GET /api/users`, `GET /api/users/{id}`, `POST /api/users`, `PUT /api/users/{id}`, `DELETE /api/users/{id}`, `POST /api/users/{id}/roles`, `DELETE /api/users/{id}/roles/{roleId}`.
- Roles: `GET /api/roles`, `GET /api/roles/{id}`, `POST /api/roles`, `PUT /api/roles/{id}`, `DELETE /api/roles/{id}`, `POST /api/roles/{id}/permissions`, `DELETE /api/roles/{id}/permissions/{permissionId}`.
- Permissions: `GET /api/permissions`, `GET /api/permissions/{id}`, `POST /api/permissions`, `PUT /api/permissions/{id}`, `DELETE /api/permissions/{id}`.
- Pages: `GET /api/lowcode-pages`, `GET /api/lowcode-pages/{id}`, `POST /api/lowcode-pages`, `PUT /api/lowcode-pages/{id}`, `DELETE /api/lowcode-pages/{id}`.

Use API details only when helping advanced users, debugging, or explaining why permissions matter.
