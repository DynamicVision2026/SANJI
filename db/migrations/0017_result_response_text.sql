-- Captured response contract: non-empty = response, empty = confirmed blank,
-- NULL = response not captured. Legacy wrong_answer_text remains unchanged.
alter table results add column response_text text null;
