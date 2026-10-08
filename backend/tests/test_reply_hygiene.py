"""Tests for backend.llm.reply_hygiene — internal labels must never leak into stored replies."""

from backend.llm.reply_hygiene import strip_internal_labels


def test_strips_leading_memory_label():
    assert strip_internal_labels("[Memory] Rainy days are perfect") == "Rainy days are perfect"


def test_strips_stacked_memory_labels():
    # Seen live: a stored reply was re-labelled each turn → "[Memory] [Memory] ..."
    assert strip_internal_labels("[Memory] [Memory] [memory] hi") == "hi"


def test_strips_memory_label_on_every_line():
    assert strip_internal_labels("[Memory] one\n[Memory] two") == "one\ntwo"


def test_leaves_normal_text_alone():
    s = "I love the rain, it feels so cozy. *smiles*"
    assert strip_internal_labels(s) == s


def test_keeps_mid_sentence_brackets():
    s = "She said [Memory] is a funny word."
    assert strip_internal_labels(s) == s


def test_strips_dangling_quick_replies_tag():
    assert strip_internal_labels("Hi!\n<quick_replies>\nHey!") == "Hi!"


def test_empty_and_none_safe():
    assert strip_internal_labels("") == ""
    assert strip_internal_labels(None) == ""
