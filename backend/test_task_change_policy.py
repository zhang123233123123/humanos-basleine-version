import unittest

from backend.app.domain.task.change_policy import has_unique_task_identity, is_explicit_change_request, matching_context_item


class TaskChangePolicyTests(unittest.TestCase):
    def test_new_task_language_is_not_a_change(self) -> None:
        self.assertFalse(is_explicit_change_request("周五前完成期末复习，大概三个小时"))

    def test_named_change_has_unique_identity(self) -> None:
        tasks = [{"title": "组会"}, {"title": "期末复习"}]
        self.assertTrue(has_unique_task_identity("把组会改成下午两点", tasks))

    def test_ambiguous_reference_cannot_mutate_task(self) -> None:
        tasks = [{"title": "论文初稿"}, {"title": "论文修改"}]
        self.assertFalse(has_unique_task_identity("把论文调整到周五", tasks))

    def test_context_item_requires_exact_unique_title(self) -> None:
        items = [{"title": "研究组会"}, {"title": "午饭"}]
        self.assertEqual("研究组会", matching_context_item("研究组会改到两点", items)["title"])
        self.assertIsNone(matching_context_item("会议改到两点", items))


if __name__ == "__main__":
    unittest.main()
