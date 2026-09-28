<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Vault */
class VaultResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'salt' => $this->salt,
            'iterations' => (int) $this->iterations,
            'check_iv' => $this->check_iv,
            'check_ct' => $this->check_ct,
            'configured' => true,
        ];
    }
}
