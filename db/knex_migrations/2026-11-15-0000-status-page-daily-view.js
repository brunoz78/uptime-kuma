exports.up = function (knex) {
    // Add new column status_page.daily_view_days (0 = off)
    return knex.schema.alterTable("status_page", function (table) {
        table.integer("daily_view_days").notNullable().defaultTo(0);
    });
};

exports.down = function (knex) {
    // Drop column status_page.daily_view_days
    return knex.schema.alterTable("status_page", function (table) {
        table.dropColumn("daily_view_days");
    });
};
