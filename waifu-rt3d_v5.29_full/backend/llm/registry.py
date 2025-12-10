from .adapters.lmstudio import LMStudioAdapter
def get_client(cfg):
    prov = cfg.get('llm',{}).get('provider','lmstudio')
    if prov == 'lmstudio': return LMStudioAdapter()
    return LMStudioAdapter()
