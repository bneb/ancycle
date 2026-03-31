SELECT user_id, revenue
FROM stg_active_users
WHERE status = 'churned'
